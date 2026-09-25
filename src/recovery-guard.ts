export type RecoverySnapshot = {
  refreshRevision: number;
  operationRevision: number;
  busy: boolean;
};
// Account identity is checked separately; these revisions protect same-account
// focus refreshes from replaying server state captured before a local operation.
export function canApplyRecovery(
  start: RecoverySnapshot,
  current: RecoverySnapshot,
) {
  return (
    !start.busy &&
    !current.busy &&
    start.refreshRevision === current.refreshRevision &&
    start.operationRevision === current.operationRevision
  );
}
