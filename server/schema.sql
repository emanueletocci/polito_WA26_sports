BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "users" (
    "id"                INTEGER NOT NULL,
    "name"              TEXT NOT NULL,
    "surname"           TEXT NOT NULL,
    "email"             TEXT NOT NULL UNIQUE,
    "password_hash"     TEXT NOT NULL,
    "salt"              TEXT NOT NULL,
    "totp_secret"       TEXT,
    "last_totp_step"    INTEGER,
    "score"             INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "facility_types" (
    "id"    INTEGER NOT NULL,
    "name"  TEXT NOT NULL UNIQUE,
    PRIMARY KEY("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "facilities" (
    "code"              TEXT NOT NULL,
    "facility_type_id"  INTEGER NOT NULL,
    "is_booked"         INTEGER NOT NULL DEFAULT 0 CHECK("is_booked" IN (0, 1)),
    PRIMARY KEY("code"),
    FOREIGN KEY("facility_type_id") REFERENCES "facility_types"("id")
);

CREATE TABLE IF NOT EXISTS "equipment" (
    "id"                    INTEGER NOT NULL,
    "facility_type_id"      INTEGER NOT NULL,
    "name"                  TEXT NOT NULL UNIQUE,
    "total_quantity"        INTEGER NOT NULL CHECK("total_quantity" >= 0),
    "available_quantity"    INTEGER NOT NULL CHECK("available_quantity" >= 0 AND "available_quantity" <= "total_quantity"),
    "min_quantity"          INTEGER NOT NULL DEFAULT 0 CHECK("min_quantity" >= 0),
    PRIMARY KEY("id" AUTOINCREMENT),
    FOREIGN KEY("facility_type_id") REFERENCES "facility_types"("id")
);

CREATE TABLE IF NOT EXISTS "reservations" (
    "id"                INTEGER NOT NULL,
    "user_id"           INTEGER NOT NULL,
    "facility_code"     TEXT NOT NULL,
    "created_at"        TEXT NOT NULL DEFAULT(datetime('now', 'localtime')),
    "status"            TEXT NOT NULL DEFAULT 'active' CHECK("status" IN ('active', 'cancelled')),
    "released_at"       TEXT,
    PRIMARY KEY("id" AUTOINCREMENT),
    FOREIGN KEY("user_id") REFERENCES "users"("id"),
    FOREIGN KEY("facility_code") REFERENCES "facilities"("code")
);

CREATE TABLE IF NOT EXISTS "rents" (
    "reservation_id"    INTEGER NOT NULL,
    "equipment_id"      INTEGER NOT NULL,
    "quantity"          INTEGER NOT NULL CHECK("quantity" > 0),
    PRIMARY KEY("reservation_id", "equipment_id"),
    FOREIGN KEY("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE,
    FOREIGN KEY("equipment_id") REFERENCES "equipment"("id")
);


-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO "facility_types" ("id", "name") VALUES
    (1, 'tennis'),
    (2, 'basketball'),
    (3, 'volleyball'),
    (4, 'soccer'),
    (5, 'table_tennis'),
    (6, 'cycling');

-- Facilities: the final state (is_booked) is inserted directly, not simulated with UPDATE.
-- T1, B1, V1, P1 end up occupied by the seed ACTIVE reservations below.
-- T2, S1, CY1 are referenced by the seed CANCELLED reservations below: they are
-- correctly free (is_booked = 0) here, since a cancelled reservation always
-- restores the facility to "free".
INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('T1', 1, 1), ('T2', 1, 0), ('T3', 1, 0);

INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('B1', 2, 1), ('B2', 2, 0);

INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('V1', 3, 1), ('V2', 3, 0);

INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('S1', 4, 0);

INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('P1', 5, 1), ('P2', 5, 0), ('P3', 5, 0), ('P4', 5, 0);

INSERT INTO "facilities" ("code", "facility_type_id", "is_booked") VALUES
    ('CY1', 6, 0), ('CY2', 6, 0);

-- Equipment: available_quantity already reflects the final state (total_quantity minus what
-- is rented by the ACTIVE seed reservations only). Cancelled reservations never affect
-- available_quantity, since their equipment was already given back upon cancellation.
-- Tennis: racket(2 min), balls(3 min), towel(optional) - 2 rackets and 3 balls rented by reservation #1 (active)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (1, 1, 'tennis_racket', 8, 6, 2),
    (2, 1, 'tennis_ball',   7, 4, 3),
    (3, 1, 'towel',         4, 4, 0);

-- Basketball: ball(1 min), cones(optional) - 1 ball rented by reservation #2 (active)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (4, 2, 'basketball', 2, 1, 1),
    (5, 2, 'cone',       4, 4, 0);

-- Volleyball: ball(1 min), knee pads(optional) - 1 ball rented by reservation #3 (active)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (6, 3, 'volleyball', 2, 1, 1),
    (7, 3, 'knee_pads',  10, 10, 0);

-- Soccer: ball(1 min), shoes(10 min), goalkeeper gloves(optional) - no ACTIVE seed reservation
-- (reservation #5 below rented this type, but it is cancelled)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (8, 4, 'soccer_ball',        2, 2, 1),
    (9, 4, 'soccer_shoes',       12, 12, 10),
    (10, 4, 'goalkeeper_gloves', 2, 2, 0);

-- Table tennis: rackets(2 min), balls(1 min) - 2 rackets and 1 ball rented by reservation #4 (active)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (11, 5, 'table_tennis_racket', 8, 6, 2),
    (12, 5, 'table_tennis_ball',   4, 3, 1);

-- Cycling: bicycle(1 min), helmet(1 min), repair kit(optional) - no ACTIVE seed reservation
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (13, 6, 'bicycle',    4, 4, 1),
    (14, 6, 'helmet',     4, 4, 1),
    (15, 6, 'repair_kit', 1, 1, 0);

-- Users

INSERT INTO "users" ("id", "name", "surname", "email", "password_hash", "salt", "totp_secret", "last_totp_step") VALUES
    (1, 'Emanuele', 'Tocci', 's363290@studenti.polito.it',
        'b04a2d3384c3b582c6f721484d22176f64a5fa943c42412d4ecf37dbcbdbf57a',
        'afbba8ce703f1028e6eb0b1659b576ee', NULL, NULL),
    (2, 'Marco',    'Rossi', 'user2@example.com',
        '36d8c80838d3ecd02a140b1c8d04df87d1bd5ce37f29067fce3bb5cbc0d30c7e',
        '02e57fa54a6fdd35aa929816b8cafff6', 'LXBSMDTMSP2I5XFXIYRGFVWSFI', NULL),
    (3, 'Giulia',   'Verdi', 'user3@example.com',
        '5af762124f64f87c9357172cd56c51b1edb8b2b52e462cf9070f431501f4eee9',
        '20cf1cea725d6bc13b4d9baacb546b86', NULL, NULL),
    (4, 'Luca',     'Neri',  'user4@example.com',
        'e2c6d719887040f219a67b96fe8ec16639e3c380fca5628b92508f1cc9286850',
        'd815dc36782d6423458f523d641da109', 'LXBSMDTMSP2I5XFXIYRGFVWSFI', NULL);

UPDATE "users" SET "score" = -1 WHERE "id" = 3;
UPDATE "users" SET "score" = -2 WHERE "id" = 4;

INSERT INTO "reservations" ("id", "user_id", "facility_code", "created_at", "status", "released_at") VALUES
    (1, 2, 'T1', '2026-08-21T10:00:00.000Z', 'active',    NULL),
    (2, 3, 'B1', '2026-08-21T11:00:00.000Z', 'active',    NULL),
    (3, 4, 'V1', '2026-08-21T12:00:00.000Z', 'active',    NULL),
    (4, 4, 'P1', '2026-08-21T13:00:00.000Z', 'active',    NULL),
    (5, 3, 'S1', '2026-08-19T09:00:00.000Z', 'cancelled', '2026-08-19T09:45:00.000Z'),
    (6, 4, 'T2', '2026-08-18T14:00:00.000Z', 'cancelled', '2026-08-18T14:30:00.000Z'),
    (7, 4, 'CY1','2026-08-19T16:00:00.000Z', 'cancelled', '2026-08-19T16:20:00.000Z');

INSERT INTO "rents" ("reservation_id", "equipment_id", "quantity") VALUES
    (1, 1, 2),   -- reservation #1 (active): 2 tennis_racket (min)
    (1, 2, 3),   -- reservation #1 (active): 3 tennis_ball (min)
    (2, 4, 1),   -- reservation #2 (active): 1 basketball (min)
    (3, 6, 1),   -- reservation #3 (active): 1 volleyball (min)
    (4, 11, 2),  -- reservation #4 (active): 2 table_tennis_racket (min)
    (4, 12, 1),  -- reservation #4 (active): 1 table_tennis_ball (min)
    (5, 8, 1),   -- reservation #5 (cancelled): 1 soccer_ball (min)
    (5, 9, 10),  -- reservation #5 (cancelled): 10 soccer_shoes (min)
    (6, 1, 2),   -- reservation #6 (cancelled): 2 tennis_racket (min)
    (6, 2, 3),   -- reservation #6 (cancelled): 3 tennis_ball (min)
    (7, 13, 1),  -- reservation #7 (cancelled): 1 bicycle (min)
    (7, 14, 1);  -- reservation #7 (cancelled): 1 helmet (min)

COMMIT;