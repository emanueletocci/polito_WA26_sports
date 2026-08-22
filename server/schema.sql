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
    "is_booked"         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY("code"),
    FOREIGN KEY("facility_type_id") REFERENCES "facility_types"("id")
);

CREATE TABLE IF NOT EXISTS "equipment" (
    "id"                    INTEGER NOT NULL,
    "facility_type_id"      INTEGER NOT NULL,
    "name"                  TEXT NOT NULL UNIQUE,
    "total_quantity"        INTEGER NOT NULL,
    "available_quantity"    INTEGER NOT NULL,
    "min_quantity"          INTEGER NOT NULL DEFAULT 0,   -- 0 = optional, >0 = mandatory minimum
    PRIMARY KEY("id" AUTOINCREMENT),
    FOREIGN KEY("facility_type_id") REFERENCES "facility_types"("id")
);

CREATE TABLE IF NOT EXISTS "reservations" (
    "id"                INTEGER NOT NULL,
    "user_id"           INTEGER NOT NULL,
    "facility_code"     TEXT NOT NULL,
    "created_at"        TEXT NOT NULL DEFAULT(datetime('now')),
    "status"            TEXT NOT NULL DEFAULT 'active' CHECK("status" IN ('active', 'cancelled')),
    "released_at"       TEXT,
    PRIMARY KEY("id" AUTOINCREMENT),
    FOREIGN KEY("user_id") REFERENCES "users"("id"),
    FOREIGN KEY("facility_code") REFERENCES "facilities"("code")
);

CREATE TABLE IF NOT EXISTS "rents" (
    "reservation_id"    INTEGER NOT NULL,
    "equipment_id"      INTEGER NOT NULL,
    "quantity"          INTEGER NOT NULL,
    PRIMARY KEY("reservation_id", "equipment_id"),
    FOREIGN KEY("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE,
    FOREIGN KEY("equipment_id") REFERENCES "equipment"("id")
);


-- ============================================================
-- SEED DATA
-- ============================================================

-- ---------- FACILITY TYPES  ----------
INSERT INTO "facility_types" ("id", "name") VALUES
    (1, 'tennis'),
    (2, 'basketball'),
    (3, 'volleyball'),
    (4, 'soccer'),
    (5, 'table_tennis'),
    (6, 'cycling');

-- ---------- FACILITIES ----------
-- Tennis: 3 courts
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('T1', 1), ('T2', 1), ('T3', 1);

-- Basketball: 2 courts
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('B1', 2), ('B2', 2);

-- Volleyball: 2 courts
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('V1', 3), ('V2', 3);

-- Soccer: 1 field
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('S1', 4);

-- Table tennis: 4 tables
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('P1', 5), ('P2', 5), ('P3', 5), ('P4', 5);

-- Cycling: 2 tracks
INSERT INTO "facilities" ("code", "facility_type_id") VALUES
    ('CY1', 6), ('CY2', 6);

-- ---------- EQUIPMENT (available_quantity = total_quantity by default) ----------
-- Tennis: racket(2 min), balls(3 min), towel(optional)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (1, 1, 'tennis_racket', 8, 8, 2),
    (2, 1, 'tennis_ball',   7, 7, 3),
    (3, 1, 'towel',         4, 4, 0);

-- Basketball: ball(1 min), cones(optional)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (4, 2, 'basketball', 2, 2, 1),
    (5, 2, 'cone',       4, 4, 0);

-- Volleyball: ball(1 min), knee pads(optional)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (6, 3, 'volleyball', 2, 2, 1),
    (7, 3, 'knee_pads',  10, 10, 0);

-- Soccer: ball(1 min), shoes(10 min), goalkeeper gloves(optional)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (8, 4, 'soccer_ball',        2, 2, 1),
    (9, 4, 'soccer_shoes',       12, 12, 10),
    (10, 4, 'goalkeeper_gloves', 2, 2, 0);

-- Table tennis: rackets(2 min), balls(1 min)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (11, 5, 'table_tennis_racket', 8, 8, 2),
    (12, 5, 'table_tennis_ball',   4, 4, 1);

-- Cycling: bicycle(1 min), helmet(1 min), repair kit(optional)
INSERT INTO "equipment" ("id", "facility_type_id", "name", "total_quantity", "available_quantity", "min_quantity") VALUES
    (13, 6, 'bicycle',    4, 4, 1),
    (14, 6, 'helmet',     4, 4, 1),
    (15, 6, 'repair_kit', 1, 1, 0);

-- ---------- USERS (all with score = 0 by default) ----------
-- Plaintext passwords for testing (do NOT use in production, seed only):
--   user1@example.com -> Password1!
--   user2@example.com -> Password2!   (2FA enabled)
--   user3@example.com -> Password3!
--   user4@example.com -> Password4!   (2FA enabled)
-- Hashes generated with scrypt (n=16384, r=8, p=1, dklen=32), random 16-byte salt.
INSERT INTO "users" ("id", "name", "surname", "email", "password_hash", "salt", "totp_secret","last_totp_step") VALUES
    (1, 'Emanuele',    'Tocci', 's363290@studenti.polito.it',
        '704e1fe979a047436eb7d1766e782e72a76df6da80da3e1f202c37e42208cf8',
        '8f650e1213b07092045b20d53fcab067', NULL, NULL),
    (2, 'Marco',   'Rossi',   'user2@example.com',
        '929ac971b0938185a8b15995801ba023b90968f8c98813b0da16b2d6f7009b6',
        '7d6342853652c5951b8bb683a404922e', 'LXBSMDTMSP2I5XFXIYRGFVWSFI', NULL),
    (3, 'Giulia',  'Verdi',   'user3@example.com',
        '28f2ff0d3be5d62176bb9543be0494f4f5764b3958d96a5877b0cf2ed7b4378',
        '9f05bb88125fdf55b89aabc279d63e84', NULL, NULL),
    (4, 'Luca',    'Neri',    'user4@example.com',
        'af885fc18e91ec720aae870927f6d8d8f423748ec3150f5a165a3efb9ddbee4',
        '5e931bb30b7e1a50ffdbf0002fe3c3be', 'LXBSMDTMSP2I5XFXIYRGFVWSFI', NULL);


-- ============================================================
-- SEED DATA - PHASE 2: simulation of reservation operations
-- (each block reproduces what the server would do on every "create reservation":
--  INSERT reservation + INSERT rents + UPDATE facility + UPDATE equipment)
-- ============================================================

-- ---- Reservation #1: user2 books T1 (tennis), mandatory minimum ----
INSERT INTO "reservations" ("id", "user_id", "facility_code", "created_at", "status") VALUES
    (1, 2, 'T1', datetime('now', '-1 day'), 'active');
INSERT INTO "rents" ("reservation_id", "equipment_id", "quantity") VALUES
    (1, 1, 2),   -- 2 tennis racket (min)
    (1, 2, 3);   -- 3 tennis ball (min)
UPDATE "facilities" SET "is_booked" = 1 WHERE "code" = 'T1';
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 2 WHERE "id" = 1;
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 3 WHERE "id" = 2;

-- ---- Reservation #2: user3 books B1 (basketball), mandatory minimum ----
INSERT INTO "reservations" ("id", "user_id", "facility_code", "created_at", "status") VALUES
    (2, 3, 'B1', datetime('now', '-1 day'), 'active');
INSERT INTO "rents" ("reservation_id", "equipment_id", "quantity") VALUES
    (2, 4, 1);   -- 1 basketball (min)
UPDATE "facilities" SET "is_booked" = 1 WHERE "code" = 'B1';
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 1 WHERE "id" = 4;

-- ---- Reservation #3: user4 books V1 (volleyball), mandatory minimum ----
INSERT INTO "reservations" ("id", "user_id", "facility_code", "created_at", "status") VALUES
    (3, 4, 'V1', datetime('now', '-1 day'), 'active');
INSERT INTO "rents" ("reservation_id", "equipment_id", "quantity") VALUES
    (3, 6, 1);   -- 1 volleyball (min)
UPDATE "facilities" SET "is_booked" = 1 WHERE "code" = 'V1';
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 1 WHERE "id" = 6;

-- ---- Reservation #4: user4 books P1 (table tennis), mandatory minimum ----
INSERT INTO "reservations" ("id", "user_id", "facility_code", "created_at", "status") VALUES
    (4, 4, 'P1', datetime('now', '-1 day'), 'active');
INSERT INTO "rents" ("reservation_id", "equipment_id", "quantity") VALUES
    (4, 11, 2),  -- 2 table_tennis_racket (min)
    (4, 12, 1);  -- 1 table_tennis_ball (min)
UPDATE "facilities" SET "is_booked" = 1 WHERE "code" = 'P1';
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 2 WHERE "id" = 11;
UPDATE "equipment" SET "available_quantity" = "available_quantity" - 1 WHERE "id" = 12;

-- ---- Negative score: user3 and user4 must have score < 0 (required by the spec) ----
-- Simulates the effect of previous "delete reservation" operations (score -1 each)
UPDATE "users" SET "score" = -1 WHERE "id" = 3;
UPDATE "users" SET "score" = -2 WHERE "id" = 4;

COMMIT;