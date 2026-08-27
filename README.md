# Exam #3: "Sports"

## Student: s363290 Tocci Emanuele

## React Client Application Routes

- Route `/`: home page, public. Shows the free/booked facility counts (by type) and the full equipment stock table.
- Route `/login`: login page. Shows the email/password form and, when the user has 2FA enabled, the second-factor (TOTP) form.
- Route `/reservations`: the logged-in user's active reservations, with buttons to edit or delete each one.
- Route `/reservations/:reservationId/edit`: modify the optional equipment of one existing reservation (`reservationId` is the reservation's numeric id).
- Route `/book`: create a new reservation (facility type/instance, then equipment quantities).

## API Server

### Authentication APIs

- POST `/api/sessions`
  - request body: `{ email, password }`
  - response body: user info `{ id, email, name, surname, score, hasTotpEnabled, isTotpVerified }`, or `401` with an error message on wrong credentials

- POST `/api/login-totp`
  - request parameters: none (requires an already logged-in session)
  - request body: `{ code }` (6-digit TOTP code)
  - response body: `{ otp: "authorized" }` (and the user's score is reset to 0), or `400`/`401` with an error message if TOTP is not enabled for the user or the code is invalid/expired/replayed

- GET `/api/sessions/current`
  - request parameters: none
  - response body: user info (same shape as `POST /api/sessions`) if authenticated, or `401` if not

- DELETE `/api/sessions/current`
  - request parameters: none
  - response body: empty object `{}` on success

### Facilities & Equipment APIs (public, no login required)

- GET `/api/facilities`
  - query parameter: `status` (optional, `"free"` or `"booked"`); if omitted, all facilities are returned
  - response body: `[{ code, facilityTypeId, facilityTypeName, isBooked }, ...]`, or `422` if `status` has an invalid value

- GET `/api/facility-types`
  - request parameters: none
  - response body: `[{ id, name }, ...]`

- GET `/api/equipment`
  - query parameter: `facilityTypeId` (optional). Without it, returns the full stock (public homepage); with it, returns only the equipment rules for that facility type (reservation form)
  - response body (no filter): `[{ id, name, totalQuantity, availableQuantity, facilityTypeName }, ...]`
  - response body (with `facilityTypeId`): `[{ id, name, totalQuantity, availableQuantity, minQuantity }, ...]` (`minQuantity` 0 = optional)

### Reservations APIs (require login)

- GET `/api/reservations`
  - request parameters: none
  - response body: the logged-in user's active reservations, e.g. `[{ id, facilityCode, facilityTypeId, facilityTypeName, createdAt, equipment: [{ equipmentId, name, quantity, minQuantity }, ...] }, ...]`

- GET `/api/reservations/:id`
  - request parameters: `id` (reservation id)
  - response body: one reservation (same shape as above, plus `status`, `releasedAt`), or `403` (not the owner) / `404` (not found) / `422` (invalid id)

- POST `/api/reservations`
  - request body: `{ facilityTypeId, facilityCode (optional, for manual selection), equipment: [{ equipmentId, quantity }, ...] }`
  - response body: the newly created reservation (same shape as `GET /api/reservations/:id`), or `422` with a specific error message (e.g. not enough facilities/equipment, too early to reserve again, request exceeds what the user's score allows)

- PUT `/api/reservations/:id`
  - request parameters: `id` (reservation id)
  - request body: `{ equipment: [{ equipmentId, quantity }, ...] }` (only optional/extra equipment can change; mandatory minimums are locked)
  - response body: the updated reservation (same shape as `GET /api/reservations/:id`), or `403`/`404`/`422` with an error message

- DELETE `/api/reservations/:id`
  - request parameters: `id` (reservation id)
  - response body: empty object `{}` on success, or `404` if the reservation does not exist or does not belong to the logged-in user

## Database Tables

- Table `users`: registered users. Columns: `id` (PK), `email` (unique), `name`, `surname`, `password_hash`, `salt`, `score`, `totp_secret` (nullable, per-user 2FA secret), `last_totp_step` (nullable, replay protection).
- Table `facility_types`: the 6 fixed sport categories. Columns: `id` (PK), `name`.
- Table `facilities`: individual bookable facility instances. Columns: `code` (PK, e.g. `"T1"`), `facility_type_id` (FK to `facility_types`), `is_booked`.
- Table `equipment`: rentable equipment types. Columns: `id` (PK), `facility_type_id` (FK to `facility_types`), `name`, `total_quantity`, `available_quantity`, `min_quantity` (0 = optional; >0 = mandatory minimum for that facility type).
- Table `reservations`: active/cancelled reservations. Columns: `id` (PK), `user_id` (FK to `users`), `facility_code` (FK to `facilities`), `created_at`, `status` (`"active"` / `"cancelled"`), `released_at` (nullable; set on cancellation, used for the 30-second rebooking cooldown).
- Table `rents`: equipment actually rented for each reservation (join table). Columns: `reservation_id` (FK to `reservations`), `equipment_id` (FK to `equipment`), `quantity`.

## Main React Components

- `App` (in `App.jsx`): top-level component; owns the authentication state (`loggedIn`, `loggedInTotp`, `user`) and declares all the routes.
- `Layout` (in `Layout.jsx`): persistent page shell; renders `Navigation` plus the matched route's content via `<Outlet />`.
- `Navigation` (in `Navigation.jsx`): top navbar; shows the login button (guest) or the user's name/score/reservation links/logout button (logged in).
- `LoginForm` / `TotpForm` (in `Auth.jsx`): the username/password form and, when needed, the second-factor (TOTP) form.
- `Home` (in `Home.jsx`): public landing page; fetches facilities/equipment and renders `FacilityCard` (one per facility type) and `EquipmentTable`.
- `Book` (in `Book.jsx`): "new reservation" page; lets the user pick a facility (manual or automatic assignment) and the equipment quantities, then submits the reservation.
- `Reservations` (in `Reservations.jsx`): lists the logged-in user's active reservations, with edit/delete actions.
- `ReservationEdit` (in `ReservationEdit.jsx`): lets the user change the optional equipment of one existing reservation, respecting the locked-mandatory and negative-score rules.

## Screenshot

![Screenshot](./img/homepage_login.png)

## Users Credentials

- `s363290@studenti.polito.it`, `Password1!` (user, no active reservations, score 0, 2FA not enabled)
- `user2@example.com`, `Password2!` (user, 1 active reservation, score 0, 2FA enabled)
- `user3@example.com`, `Password3!` (user, 1 active reservation, score -1, 2FA not enabled)
- `user4@example.com`, `Password4!` (user, 2 active reservations, score -2, 2FA enabled)
