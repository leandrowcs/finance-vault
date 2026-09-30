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
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

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
});