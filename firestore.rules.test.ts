/**
 * Payload-First Security Test Cases for ChannelLife Firestore Rules
 * Verifies the "Dirty Dozen" attack payloads described in security_spec.md.
 */

export const DIRTY_DOZEN_SECURITY_CASES = [
  {
    name: '1. Unauthenticated user cannot list requests (PII isolation)',
    operation: 'list',
    path: 'requests',
    authenticated: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Unauthenticated user cannot read channel_private owner phone',
    operation: 'get',
    path: 'channel_private/ch_drivelife',
    authenticated: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Unauthenticated user cannot list unpublished channels',
    operation: 'list',
    path: 'channels',
    query: 'unfiltered',
    authenticated: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Public request creation cannot set status to Approvata',
    operation: 'create',
    path: 'requests/req_bad_status',
    authenticated: false,
    payload: { status: 'Approvata', confirmationSent: true, linkedChannelId: 'ch_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Public request creation rejects shadow/ghost fields',
    operation: 'create',
    path: 'requests/req_ghost',
    authenticated: false,
    payload: { role: 'admin', isVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Unverified email matching admin address is denied',
    operation: 'get',
    path: 'requests/req_1',
    auth: { uid: 'spoof', email: 'mtech2415@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Non-admin cannot self-register in /admins',
    operation: 'create',
    path: 'admins/attacker',
    auth: { uid: 'attacker', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Admin cannot create orphan channel with missing categoryId',
    operation: 'create',
    path: 'channels/ch_orphan',
    auth: { uid: 'admin', email: 'mtech2415@gmail.com', email_verified: true },
    payload: { categoryId: 'cat_nonexistent' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Invalid document ID is rejected by isValidId()',
    operation: 'create',
    path: 'requests/' + 'a'.repeat(200),
    authenticated: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Client-forged timestamp is rejected on create',
    operation: 'create',
    path: 'requests/req_time_spoof',
    authenticated: false,
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Immutable fields (createdAt, type) cannot change on update',
    operation: 'update',
    path: 'requests/req_1',
    auth: { uid: 'admin', email: 'mtech2415@gmail.com', email_verified: true },
    payload: { type: 'join_channel' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Public click event targeting missing channel is denied',
    operation: 'create',
    path: 'channel_clicks/clk_missing',
    authenticated: false,
    payload: { id: 'clk_missing', channelId: 'ch_does_not_exist' },
    expected: 'PERMISSION_DENIED',
  },
] as const;
