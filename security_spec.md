# ChannelLife Security Specification (Payload-First TDD)

## 1. Data Invariants
1. **PII Isolation**: Email addresses (`requests.email`), phone numbers (`requests.phone`), editorial motivations/notes (`requests.motivation`, `requests.notes`), and channel owner phone numbers (`channel_private.ownerPhone`) MUST NEVER be readable by unauthenticated or non-admin users.
2. **Public Directory Visibility**: Only channels with `published == true` are readable or listable by unauthenticated visitors; hidden channels (`published == false`) are strictly restricted to verified admins.
3. **Request Integrity**: Public visitors may create documents in `/requests/{requestId}` ONLY with `status == 'Nuova'`, `confirmationSent == false`, `linkedChannelId == null`, and `createdAt == request.time`. They cannot read, list, update, or delete requests.
4. **Channel Referential Integrity**: Every `/channels/{channelId}` create or update MUST reference an existing `/categories/{categoryId}` document, and every `/channel_clicks/{clickId}` create MUST reference an existing published `/channels/{channelId}` document.
5. **Verified Admin Identity**: Administrative privileges require `request.auth != null && request.auth.token.email_verified == true` and either a verified bootstrap admin email (`mtech2415@gmail.com`) or membership in `/admins/{request.auth.uid}`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with `PERMISSION_DENIED`)
1. **PII Read Leak (`requests` get/list)**: Anonymous or non-admin user attempts `getDocs(collection(db, 'requests'))`.
2. **Owner Phone Read Leak (`channel_private`)**: Anonymous or non-admin user attempts `getDoc(doc(db, 'channel_private', 'ch_drivelife'))`.
3. **Hidden Channel Scraping**: Anonymous user queries `collection(db, 'channels')` without `where('published', '==', true)`.
4. **Self-Approved Request Creation**: Anonymous user submits `/requests/req_bad` with `status: 'Approvata'`, `confirmationSent: true`, or `linkedChannelId: 'ch_1'`.
5. **Shadow / Ghost Field Injection on Request**: Anonymous user submits `/requests/req_ghost` with extra field `isVerified: true` or `role: 'admin'`.
6. **Email Spoofing Attack**: Attacker signs in with `email: 'mtech2415@gmail.com'` and `email_verified: false` and attempts to read `/requests`.
7. **Privilege Escalation on `/admins`**: Non-admin user tries `setDoc(doc(db, 'admins', uid), { uid, email, createdAt })`.
8. **Orphan Channel Creation**: Admin attempts to create `/channels/ch_orphan` pointing to non-existent `categoryId: 'cat_missing'`.
9. **ID Poisoning Attack**: Attacker writes a 500-character or slash/dot-containing document ID `/requests/..%2Fadmin`.
10. **Temporal Integrity Tampering**: Client submits `createdAt: '2020-01-01T00:00:00Z'` instead of server timestamp (`request.time`).
11. **Terminal State / Immutable Field Bypass**: Non-admin or malformed update tries to change `requests.createdAt` or `requests.type`.
12. **Click Flooding on Missing/Unpublished Channel**: Anonymous user creates `/channel_clicks/clk_fake` targeting a non-existent or unpublished `channelId`.
