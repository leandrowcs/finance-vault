# Product Decisions

## Batch 0: Accepted

### Currency

- All amounts use Canadian dollars (CAD).

### Household

- The household owner is Leandro Wanderley.
- The spouse is Ketlin Pedron.
- Shared expenses remain split equally between them.
- The original invitation to Ketlin has already been sent. Do not send another original invitation.
- Automatic email delivery is deferred until the app supports inviting people beyond this household. Current invitations require the user to send the prefilled email.

### Available balance

- A received income first covers planned bills due after that income's receipt date, ordered by due date.
- After those obligations are covered, any remaining amount can cover other future bills.
- Goal contributions must use only the remaining available amount; they are transfers, not expenses or income.
- The dashboard and goal planner must use the same allocation result.

### Planned and manual income

- A manual income matching a planned income on both date and amount requires confirmation.
- The user chooses whether the manual record replaces the planned payment or represents additional income.
- Replacement must not count the same payment twice. Additional income keeps both records.

### Completed goals

- Completed goals move to Achieved Goals; they are not deleted.
- The owner can record when goal funds were used and how much was spent.
- Any unused goal balance may return to the current month's available balance.
- Spending above the goal balance may use current-month available funds; it must not create income or hide the overage.

## Follow-up Batches

1. Unify income allocation and monthly balance calculations; add focused financial tests.
2. Planning data: implemented with Firestore-backed periods, recurring bill templates, actual receipt events, bill occurrences, overdue status, and payment history. Seed migration is versioned and deterministic; recurring occurrences are generated 12 months forward.
3. Add planned/manual income matching and explicit replace-or-add confirmation.
4. Add Achieved Goals, spending records, and return of unused funds to the current month.
5. Add automatic invitation delivery only when inviting additional people becomes a product requirement.