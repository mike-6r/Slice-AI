# Admin Physical Intake Design QA

## Scope

The Physical Intake console is organized as a single operational workbench. The page uses one compact lifecycle summary, stage tabs, a filter/sort toolbar, and an identity-first intake table. Permanent right-rail overview, destination, and quick-action panels were removed.

## Acceptance checks

- `ADMIN-INTAKE-DESIGN-001` — lifecycle summary is compact and counts are not duplicated in a donut/sidebar.
- `ADMIN-INTAKE-DESIGN-002` — rows lead with authorized front media, collectible identity, collector, stage, destination, shipment, age, and next action.
- `ADMIN-INTAKE-DESIGN-003` — long identity and destination values wrap/truncate inside intentional columns without page overflow.
- `ADMIN-INTAKE-DESIGN-004` — Open intake exposes status, next actor, lifecycle timeline, shipment, private evidence, and links to review/account context.
- `ADMIN-INTAKE-RECEIPT-001` — receipt remains a confirmation action and is never inferred from carrier delivery.
- `ADMIN-INTAKE-DESTINATION-001` — destination approval/pause actions require an operator reason and remain outside the main intake table rail.
- `ADMIN-INTAKE-RBAC-001` — API authorization remains authoritative for intake reads, destination changes, and receipt confirmation.

## Manual staging checks

Check Awaiting shipment, In transit, Carrier delivered, Received, Verification, Ready for vault, and Exceptions with both populated and zero-state data. Confirm the Charizard reference remains `SLICE-3AA5144D`, destination `beta-test-uk-intake`, shipment `NONE`, and next actor `Collector`.
