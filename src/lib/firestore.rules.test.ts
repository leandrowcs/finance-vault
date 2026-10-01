import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const rulesDescribe = firestoreEmulator ? describe : describe.skip;
let environment: RulesTestEnvironment;

rulesDescribe("Firestore household access rules", () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "financevault-rules-tests",
      firestore: { rules: await readFile("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  async function seedMember(accessLevel: "read" | "edit" | "delete") {
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, "households", "owner"), { ownerUid: "owner" });
      await setDoc(doc(firestore, "households", "owner", "members", "owner"), {
        uid: "owner",
        accessLevel: "owner",
        email: "owner@example.com",
      });
      await setDoc(doc(firestore, "households", "owner", "members", "member"), {
        uid: "member",
        accessLevel,
        email: "member@example.com",
      });
      await setDoc(doc(firestore, "users", "owner", "memberships", "owner"), {
        ownerUid: "owner",
        accessLevel: "owner",
      });
      await setDoc(doc(firestore, "users", "member", "memberships", "owner"), {
        ownerUid: "owner",
        accessLevel,
      });
      await setDoc(doc(firestore, "users", "owner", "movements", "sample"), { amount: 12 });
    });
  }

  it("lets readers see owner data but not change it", async () => {
    await seedMember("read");
    const firestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();

    await assertSucceeds(getDoc(doc(firestore, "users", "owner", "movements", "sample")));
    await assertFails(setDoc(doc(firestore, "users", "owner", "movements", "new"), { amount: 3 }));
  });

  it("lets editors create and update owner data but not delete it", async () => {
    await seedMember("edit");
    const firestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();
    const movement = doc(firestore, "users", "owner", "movements", "sample");

    await assertSucceeds(updateDoc(movement, { amount: 20 }));
    await assertSucceeds(setDoc(doc(firestore, "users", "owner", "movements", "new"), { amount: 3 }));
    await assertFails(deleteDoc(movement));
  });

  it("lets delete-role members delete owner data", async () => {
    await seedMember("delete");
    const firestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();

    await assertSucceeds(deleteDoc(doc(firestore, "users", "owner", "movements", "sample")));
  });

  it("accepts an invitation only for its matching email", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "households", "owner", "invites", "invite"), {
        email: "member@example.com",
        accessLevel: "edit",
        status: "pending",
        createdBy: "owner",
        expiresAt: new Date(Date.now() + 86400000),
      });
    });
    const firestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, "households", "owner", "invites", "invite"), {
      status: "accepted",
      acceptedBy: "member",
      acceptedAt: new Date(),
    });
    batch.set(doc(firestore, "households", "owner", "members", "member"), {
      uid: "member",
      email: "member@example.com",
      displayName: "Member",
      accessLevel: "edit",
      inviteId: "invite",
    });
    batch.set(doc(firestore, "users", "member", "memberships", "owner"), {
      ownerUid: "owner",
      accessLevel: "edit",
    });

    await assertSucceeds(batch.commit());
  });

  it("rejects expired invitations", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "households", "owner", "invites", "expired"), {
        email: "member@example.com",
        accessLevel: "read",
        status: "pending",
        createdBy: "owner",
        expiresAt: new Date(Date.now() - 86400000),
      });
    });
    const firestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();

    await assertFails(updateDoc(doc(firestore, "households", "owner", "invites", "expired"), {
      status: "accepted",
      acceptedBy: "member",
      acceptedAt: new Date(),
    }));
  });

  it("revokes membership access", async () => {
    await seedMember("read");
    const firestore = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, "households", "owner", "members", "member"));
    batch.delete(doc(firestore, "users", "member", "memberships", "owner"));

    await assertSucceeds(batch.commit());
    const memberFirestore = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();
    await assertFails(getDoc(doc(memberFirestore, "users", "owner", "movements", "sample")));
  });

  it("creates, accepts, downgrades and revokes an invitation without changing personal data", async () => {
    const owner = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
    const member = environment.authenticatedContext("new-member", { email: "new@example.com" }).firestore();
    const stranger = environment.authenticatedContext("stranger", { email: "stranger@example.com" }).firestore();
    const inviteRef = doc(owner, "households", "owner", "invites", "flow-invite");
    const personalRef = doc(member, "users", "new-member", "movements", "personal");
    expect((await getDoc(inviteRef)).exists()).toBe(false);
    expect((await getDoc(personalRef)).exists()).toBe(false);
    await setDoc(personalRef, { amount: 75, description: "Personal record" });
    await setDoc(doc(owner, "users", "owner", "movements", "shared"), { amount: 100 });
    await assertFails(getDoc(doc(member, "users", "owner", "movements", "shared")));

    await assertSucceeds(setDoc(inviteRef, {
      email: "new@example.com", accessLevel: "edit", delivery: "manual",
      status: "pending", createdBy: "owner", expiresAt: new Date(Date.now() + 86400000),
    }));
    await assertFails(updateDoc(doc(stranger, inviteRef.path), {
      status: "accepted", acceptedBy: "stranger", acceptedAt: new Date(),
    }));
    expect((await getDoc(inviteRef)).data()?.status).toBe("pending");

    const memberRef = doc(member, "households", "owner", "members", "new-member");
    const membershipRef = doc(member, "users", "new-member", "memberships", "owner");
    const acceptance = writeBatch(member);
    acceptance.update(doc(member, inviteRef.path), {
      status: "accepted", acceptedBy: "new-member", acceptedAt: new Date(),
    });
    acceptance.set(memberRef, {
      uid: "new-member", email: "new@example.com", displayName: "New member",
      accessLevel: "edit", inviteId: "flow-invite",
    });
    acceptance.set(membershipRef, { ownerUid: "owner", accessLevel: "edit" });
    await assertSucceeds(acceptance.commit());
    expect((await getDoc(inviteRef)).data()?.acceptedBy).toBe("new-member");
    expect((await getDoc(memberRef)).data()?.accessLevel).toBe("edit");
    expect((await getDoc(membershipRef)).data()?.accessLevel).toBe("edit");
    expect((await getDoc(personalRef)).data()?.amount).toBe(75);
    expect((await getDoc(doc(owner, "users", "owner", "movements", "personal"))).exists()).toBe(false);
    await assertSucceeds(updateDoc(doc(member, "users", "owner", "movements", "shared"), { amount: 120 }));

    const downgrade = writeBatch(owner);
    downgrade.update(doc(owner, memberRef.path), { accessLevel: "read" });
    downgrade.update(doc(owner, membershipRef.path), { accessLevel: "read" });
    await assertSucceeds(downgrade.commit());
    expect((await getDoc(membershipRef)).data()?.accessLevel).toBe("read");
    expect((await getDoc(doc(member, "users", "owner", "movements", "shared"))).data()?.amount).toBe(120);
    await assertFails(updateDoc(doc(member, "users", "owner", "movements", "shared"), { amount: 999 }));

    const removal = writeBatch(owner);
    removal.delete(doc(owner, memberRef.path));
    removal.delete(doc(owner, membershipRef.path));
    await assertSucceeds(removal.commit());
    expect((await getDoc(membershipRef)).exists()).toBe(false);
    await assertFails(getDoc(doc(member, "users", "owner", "movements", "shared")));
    expect((await getDoc(personalRef)).data()?.amount).toBe(75);
  });

  it("persists goal contributions and their allocation atomically and releases them on deletion", async () => {
    await seedMember("edit");
    const editor = environment.authenticatedContext("member", { email: "member@example.com" }).firestore();
    const owner = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
    const goalRef = doc(editor, "users", "owner", "goals", "trip");
    const settingsRef = doc(editor, "users", "owner", "settings", "shared-state");
    expect((await getDoc(goalRef)).exists()).toBe(false);
    expect((await getDoc(settingsRef)).exists()).toBe(false);
    await assertSucceeds(setDoc(goalRef, { id: "trip", name: "Trip", target: 200, saved: 0, contributions: [] }));
    expect((await getDoc(goalRef)).data()?.saved).toBe(0);

    const contribution = { id: "transfer", amount: 50, date: "2026-10-01", incomeSourceId: "salary" };
    const transfer = writeBatch(editor);
    transfer.update(goalRef, { saved: 50, contributions: [contribution] });
    transfer.set(settingsRef, { incomeAllocations: { salary: 50 } });
    await assertSucceeds(transfer.commit());
    expect((await getDoc(goalRef)).data()?.contributions).toEqual([contribution]);
    expect((await getDoc(settingsRef)).data()?.incomeAllocations.salary).toBe(50);

    const forbiddenRemoval = writeBatch(editor);
    forbiddenRemoval.set(settingsRef, { incomeAllocations: { salary: 0 } });
    forbiddenRemoval.delete(goalRef);
    await assertFails(forbiddenRemoval.commit());
    expect((await getDoc(goalRef)).data()?.saved).toBe(50);
    expect((await getDoc(settingsRef)).data()?.incomeAllocations.salary).toBe(50);

    const removal = writeBatch(owner);
    removal.set(doc(owner, settingsRef.path), { incomeAllocations: { salary: 0 } });
    removal.delete(doc(owner, goalRef.path));
    await assertSucceeds(removal.commit());
    expect((await getDoc(goalRef)).exists()).toBe(false);
    expect((await getDoc(settingsRef)).data()?.incomeAllocations.salary).toBe(0);
  });
});
