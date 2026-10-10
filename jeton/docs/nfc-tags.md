# NFC tags — identify, write, protect, enrol 1000 tags

Companion of ADR 0001 and `POST /tags/enroll`, `POST /tags/{tag_code}/confirm`. Audience: whoever prepares the tags before the event.

## 1. What do we have? Identify the blank chip

Do this on 3-5 samples of the batch **and** on a random 1 % of the 1000 (batches are sometimes mixed).

| Chip | User memory | Typical signs | Use? |
|---|---|---|---|
| **NTAG213** | 144 B | 7-byte UID `04:..`, ATQA `00 44`, SAK `00`, GET_VERSION `00 04 04 02 01 00 0F 03` | **Recommended** (cheapest, enough for ~45 B URL) |
| **NTAG215** | 504 B | GET_VERSION `... 01 00 11 03`, CC byte `3E` | Good (amiibo-style stickers; costs a bit more) |
| **NTAG216** | 888 B | GET_VERSION `... 01 00 13 03`, CC byte `6D` | Good, overkill |
| NTAG424 DNA | 416 B | GET_VERSION product `04 04 02 30 ...`, ISO 14443-4 (SAK `20`) | Best security (SUN/CMAC), different write procedure; not used in v1 |
| MIFARE Ultralight (EV1) | 48/128 B | GET_VERSION `... 01 00 0B/0E 03` | Works for 48 B+ with care; password feature exists; avoid if possible |
| **MIFARE Classic 1K/4K** | 1/4 KB | 4-byte UID (often), ATQA `00 04`, SAK `08`/`18` | **Reject**: weak Crypto1, iPhones cannot read it as NDEF, needs MAD formatting. Do not use. |
| Clone "magic"/UID-changeable cards | - | Accept back-door commands | **Reject** (defeats the UID binding) |
| Unknown / "NFC Forum Type 2" without GET_VERSION | ? | - | Mark `chip_type=other`, no password protection => allowed but flagged |

How to identify with an Android phone: **NFC TagInfo by NXP** (free) shows IC manufacturer, type (e.g. "NXP NTAG213"), memory size, UID, and can
read the originality signature. Check also: UID is 7 bytes starting `04`, and the chip is *not* writable-only-once (OTP/lock bits not set). If TagInfo says
"locked" or shows lock bits set on the static lock bytes, **discard the sample** (we never use permanent locks and cannot rewrite it).
Also test that a plain iPhone (XS or newer) reads an NDEF URL on one sample and that the tag still reads through the plastic object it will be glued on
(metal or water-filled objects detune the antenna; use ferrite-backed/on-metal tags for those).

## 2. What to write

One NDEF message, one **URI record**, written in the NFC Forum Type 2 TLV container:

```
Page 3 (CC):      E1 10 <size/8> 00     (size/8: 12 NTAG213, 3E NTAG215, 6D NTAG216)
Page 4..:         03 <len> D1 01 <payload_len> 55 04 <tag host+path+code bytes> FE
                  |  |     |  |  |            |  |
                  |  |     |  |  |            |  URI identifier 0x04 = "https://"
                  |  |     |  |  |            record type 'U' (0x55)
                  |  |     |  |  payload length = 1 + len(rest of URL)
                  |  |     |  type length 1
                  |  |     header MB|ME|SR|TNF=1 (well-known) = 0xD1
                  |  total NDEF length
                  NDEF TLV tag
```
Payload URL: `jeton.example/t/<tag_code>` (the `https://` is the 0x04 prefix) e.g. `jeton.example/t/0123456789ABCDEFGHJ0` = 37 bytes + 1 prefix.
Write **exactly** `ndef_url` returned by `/tags/enroll` (do not rebuild it). Short host => short message => fits even NTAG213 with lots of room.
Nothing else goes on the tag: no balance, no name, no UID copy.

## 3. Protect it (NTAG213/215/216 only)

Goal: nobody can overwrite the URL with a phone (denial of service, phishing redirect). Reading stays open (guests must read it).
Use the values from `EnrollTagResponse.protection`; **write the password config last**, after the NDEF write and read-back.

| Config page (CFG0 / CFG1 / PWD / PACK) | NTAG213 | NTAG215 | NTAG216 |
|---|---|---|---|
| CFG0 (AUTH0 in byte 3) | 0x29 (41) | 0x83 (131) | 0xE3 (227) |
| CFG1 (ACCESS in byte 0) | 0x2A (42) | 0x84 (132) | 0xE4 (228) |
| PWD (4 B) | 0x2B (43) | 0x85 (133) | 0xE5 (229) |
| PACK (2 B + 2 B zero) | 0x2C (44) | 0x86 (134) | 0xE6 (230) |

Steps (after NDEF is written and verified):
1. Write PWD page = `pwd` (4 bytes). Write PACK page = `pack` (2 bytes) + `00 00`.
2. Write CFG1: `PROT = 0` (bit 7 = 0: password needed for **write** only), `CFGLCK = 0` (bit 6 = 0, **do not lock the configuration**), `NFC_CNT_EN = 0`,
   `AUTHLIM` = 7 (bits 2..0 = `111`: lock after 7 wrong attempts). So ACCESS = `0x07`.
3. Write CFG0: keep other bytes, set `AUTH0 = 0x04` (protect from page 4 = the whole user memory).
4. Verify: read-back works without password; a write of page 4 **without** `PWD_AUTH` fails (NAK); with `PWD_AUTH(pwd)` returning `pack` it succeeds.
5. Report `password_protected=true` in `/tags/{tag_code}/confirm`.

Rules: **never** set static lock bytes, dynamic lock bytes or `CFGLCK` (permanent, irreversible) — a mistake would brick a tag or freeze a bad config.
Password = first 4 bytes of `HMAC-SHA256(master_key, "pwd" || uid)`, PACK = bytes 4-5; the server recomputes it, so a tag can be re-keyed or
re-written by a staff app (`/tags/enroll` on a still-`pending`/retired tag) without storing 1000 secrets. Keep `master_key` in the server secret store and back it up
offline: **losing it means the tags cannot be rewritten** (they still work for payments). Chips without PWD_AUTH (`other`) remain unprotected: accept, flag, and
rely on server-side checks.

## 4. Anti-clone check at enrolment

* Read the 32-byte originality signature (`READ_SIG`, command `3C 00`) and send it in `/tags/enroll`; the server verifies it with the NXP public key.
  A failure marks `signature_verified=false`: **do not use that tag** (counterfeit or UID-changeable).
* UIDs are unique per chip; the server refuses a UID that is already enrolled with another `tag_code` (`TAG_ALREADY_ENROLLED`).

## 5. Bulk enrolment procedure for 1000 tags

Equipment: 2 Android phones with the Jeton encoder screen (admin/cashier login on an enrolled `console` device), a table, a stack of tags in strips of 50,
sample plastic objects, a printed checklist.

1. **Pre-flight** (day -7): identify chip type (section 1), buy 5-10 % spares (1050-1100 tags). Enrol the devices; create a *draft* event; check `/health` server time.
2. **Dry run** on 5 tags: enrol, write, protect, confirm, tap with an Android phone (Jeton terminal) and an iPhone (balance page opens, shows 0 tokens).
3. **Encode loop** per tag (target 8-10 s): place tag on the reader -> app reads UID (+ signature) -> `POST /tags/enroll` -> writes NDEF -> reads back -> applies protection ->
   verifies a write without password fails -> `POST /tags/{tag_code}/confirm` -> green screen + counter (n/1000). Failure: retry the same tag (same `tag_code` is returned
   while `pending`); after 2 failures put the tag in the reject bin. Work in batches of 50 and keep strips in order.
4. **Glue** only `active` tags onto the objects; stick the tag in the same spot and orientation each time; keep objects flat for the antenna.
5. **QA after gluing** (100 %): tap each object with a terminal: `GET /tags/{tag_code}?uid=...` must return `tag_status=active`. Sample 10 % with an iPhone. Reject and
   `retired` tags that fail (they are never reused).
6. **Reconcile**: `GET /events/{event_id}/tags` count vs number of objects; list `pending` tags (never confirmed) and resolve each.
7. **Back up** the `tags` table (tag_code, uid, chip_type) offline together with the `master_key`.
8. **Do not print the `tag_code` on the object** (it is the capability for the public balance page); if support needs an id, print the last 4 characters only.

Troubleshooting: phone does not detect tag -> remove metal, hold still 1 s; "NDEF capacity exceeded" -> wrong chip detected, re-run identification; PWD_AUTH fails on
a tag that was protected earlier -> UID read wrongly or `master_key` differs from the one used originally.
