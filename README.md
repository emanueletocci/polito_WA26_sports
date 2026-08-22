# Exam #1234: "Exam Title"

## Student: s363290 TOCCI EMANUELE 

## React Client Application Routes

- Route `/`: page content and purpose
- Route `/something/:param`: page content and purpose, param specification
- ...

## API Server

### Authentication APIs

- POST `/api/sessions`
  - request body content: `{ email, password }`
  - response body content: user info `{ id, email, name, surname, score, canDoTotp, isTotp }`, or `401` with error message on wrong credentials

- POST `/api/login-totp`
  - request parameters: none (requires an active session, first-factor login already done)
  - request body content: `{ code }` (6-digit TOTP code)
  - response body content: `{ otp: 'authorized' }`, or `401`/`400` with error message if the code is invalid, expired, replayed, or TOTP is not enabled for the user

- GET `/api/sessions/current`
  - request parameters: none
  - response body content: user info (same shape as `POST /api/sessions`) if authenticated, or `401` if not

- DELETE `/api/sessions/current`
  - request parameters: none
  - response body content: empty object `{}` on success

### Facilities & Equipment APIs (public, no login required)

- GET `/api/facilities`
  - request parameters: none
  - response body content: list of facilities with their type and booking status, e.g. `[{ code, facilityTypeId, facilityTypeName, isBooked }, ...]`

- GET `/api/equipment`
  - request parameters: none
  - response body content: list of equipment types with total/available quantity, e.g. `[{ id, name, totalQuantity, availableQuantity }, ...]`

### Reservations APIs (require login)

- GET `/api/reservations`
  - request parameters: none
  - response body content: list of the logged-in user's active reservations, each with facility info and rented equipment, e.g. `[{ id, facilityCode, facilityTypeName, createdAt, equipment: [{ equipmentId, name, quantity }, ...] }, ...]`

- POST `/api/reservations`
  - request body content: `{ facilityTypeId, facilityCode (optional, for direct selection), equipment: [{ equipmentId, quantity }, ...] }`
  - response body content: the newly created reservation (same shape as in `GET /api/reservations`), or `422`/`404` with a specific error message (e.g. "not enough facilities", "not enough equipment of type X", "too early to reserve again")

- PUT `/api/reservations/:id`
  - request parameters: `id` (reservation id)
  - request body content: `{ equipment: [{ equipmentId, quantity }, ...] }` (only optional/extra equipment can be changed, not the mandatory minimum)
  - response body content: the updated reservation, or `404`/`422` with error message

- DELETE `/api/reservations/:id`
  - request parameters: `id` (reservation id)
  - response body content: empty object `{}` on success, or `404` if the reservation does not exist or does not belong to the logged-in user

## Database Tables

- Table `users`: contains user account data: email, hashed password with salt, optional TOTP secret and last consumed TOTP step (for 2FA and replay protection), and a score used to limit equipment choices after cancellations.
- Table `facility_types`: contains the 6 fixed sport facility categories (tennis, basketball, volleyball, soccer, table tennis, cycling).
- Table `facilities`: contains each individual bookable facility instance (e.g. "T1", "B2"), its type, and whether it is currently booked.
- Table `equipment`: contains each rentable equipment type, its total and currently available quantity, the facility type it belongs to, and the mandatory minimum quantity required when booking that facility type (0 means optional).
- Table `reservations`: contains each active or cancelled reservation, linking a user to a facility, with creation time, status, and release time (used to enforce the 30-second rebooking cooldown).
- Table `rents`: contains the equipment actually rented for each reservation, with the quantity requested for each equipment type (join table between `reservations` and `equipment`).

## Main React Components

- `ListOfSomething` (in `List.js`): component purpose and main functionality
- `GreatButton` (in `GreatButton.js`): component purpose and main functionality
- ...

(only _main_ components, minor ones may be skipped)

## Screenshot

![Screenshot](./img/screenshot.png)

## Users Credentials

- `s363290@studenti.polito.it`, `Password1!` (no active reservations, score 0, 2FA not enabled)
- `user2@example.com`, `Password2!` (1 active reservation, score 0, 2FA enabled)
- `user3@example.com`, `Password3!` (1 active reservation, score -1, 2FA not enabled)
- `user4@example.com`, `Password4!` (2 active reservations, score -2, 2FA enabled)
