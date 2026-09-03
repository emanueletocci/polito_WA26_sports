# Exam #3: "Sports"

## Student: s363290 Tocci Emanuele

## React Client Application Routes

- Route `/`: public home page. Shows the facilities grouped by type (how many are free out of the total, with the codes of the free ones) and the availability of every equipment type. Accessible without logging in.
- Route `/login`: login page. Asks for email and password and, for the users who have 2FA enabled, then shows the form for the TOTP code.
- Route `/reservations`: list of the active reservations of the logged-in user, with the equipment of each one and the buttons to modify or delete it.
- Route `/reservations/:reservationId/edit`: page that modifies the equipment of one existing reservation. `reservationId` is the id of the reservation to modify.
- Route `/book`: page that creates a new reservation: choice of the facility type, manual or automatic choice of the facility, and choice of the equipment.
- Route `*`: page shown for any unknown address, with a link back to the home page.

## API Server

### Authentication

- POST `/api/sessions`
  - Performs the login.
  - Request body: `{ email, password }`.
  - Response: the info of the logged-in user, `{ id, email, name, surname, score, hasTotpEnabled, isTotpVerified }`. 401 if the credentials are wrong.
- POST `/api/login-totp`
  - Second step of the login: verifies the TOTP code and resets the score to 0.
  - Request body: `{ code }`. Requires an open session.
  - Response: `{ otp: "authorized" }`. 400 if the user has no TOTP secret, 401 if the code is wrong, expired or already used.
- GET `/api/sessions/current`
  - Returns the info of the currently logged-in user, in the same format as the login. 401 if there is no session.
- DELETE `/api/sessions/current`
  - Performs the logout of the current user.
  - Response: `{}`.

### Facilities and equipment (public)

- GET `/api/facilities`
  - Returns all the facilities. Optional query parameter `status`, with value `free` or `booked`, to get only those.
  - Response: array of `{ code, isBooked, facilityTypeId, facilityTypeName }`. 422 with `{ error }` if `status` has a value other than the two allowed ones.
- GET `/api/facility-types`
  - Returns the list of the facility types.
  - Response: array of `{ id, name }`.
- GET `/api/equipment`
  - Returns all the equipment. Optional query parameter `facilityTypeId` to get only the equipment of one facility type.
  - Response: array of `{ id, name, totalQuantity, availableQuantity, minQuantity }`, plus `facilityTypeId` and `facilityTypeName` when the query parameter is absent. `minQuantity` greater than 0 means that the equipment is mandatory for that facility type. 422 with `{ error }` if `facilityTypeId` is not a positive integer.

### Reservations (login required)

- GET `/api/reservations`
  - Returns the active reservations of the logged-in user, each one with its equipment.
  - Response: array of `{ id, userId, facilityCode, facilityTypeId, facilityTypeName, createdAt, equipment: [{ reservationId, equipmentId, name, quantity, minQuantity }] }`.
- GET `/api/reservations/:id`
  - Returns one reservation of the logged-in user, with its equipment. Same format as above, plus `status` and `releasedAt`. 404 if it does not exist or belongs to another user (the two cases are not told apart on purpose, so that the existence of a reservation of somebody else is not disclosed).
- POST `/api/reservations`
  - Creates a new reservation.
  - Request body: `{ facilityTypeId, facilityCode, equipment: [{ equipmentId, quantity }] }`. `facilityCode` is optional: when it is absent the server assigns a free facility of the requested type.
  - Response: the created reservation, with its equipment. 422 with `{ error }` if the facility or the equipment is not available, if the mandatory minimum quantities are not respected, if the requested equipment does not belong to the facility type, if the score of the user does not allow the request, or if fewer than 30 seconds have passed since the user released a facility of the same type.
- PUT `/api/reservations/:id`
  - Modifies the equipment of an existing reservation.
  - Request body: `{ equipment: [{ equipmentId, quantity }] }`, the complete list the reservation must end up with: an item missing from the list is treated as reduced to 0.
  - Response: the updated reservation, with its equipment. 404 if it does not exist or belongs to another user. 422 with `{ error }` if the reservation is not active any more, if a mandatory item would go below its minimum quantity, if the score of the user does not allow adding equipment, or if the added quantity is not available.
- DELETE `/api/reservations/:id`
  - Deletes a reservation: it makes the facility and the equipment available again, records the release time (used for the 30-second rule) and decreases the score of the user by 1.
  - Response: `{}`. 404 if it does not exist or belongs to another user, 422 if it is not active any more.

## Database Tables

- Table `users`: the users of the application. Columns: `id` (primary key), `name`, `surname`, `email` (unique), `password_hash`, `salt`, `totp_secret`, `last_totp_step` (last TOTP time step used, against replay), `score`.
- Table `facility_types`: the types of facility of the sport center (tennis, basketball, ...). Columns: `id` (primary key), `name` (unique).
- Table `facilities`: the single facilities. Columns: `code` (primary key, e.g. "T2"), `facility_type_id`, `is_booked` (0 or 1).
- Table `equipment`: the equipment available for rental, with the rule that applies to its facility type. Columns: `id` (primary key), `facility_type_id`, `name` (unique), `total_quantity`, `available_quantity`, `min_quantity` (0 means optional, greater than 0 means mandatory with that minimum).
- Table `reservations`: the reservations. Columns: `id` (primary key), `user_id`, `facility_code`, `created_at`, `status` ("active" or "cancelled"), `released_at` (when it was cancelled, used for the 30-second rule).
- Table `rents`: the equipment rented by every reservation. Columns: `reservation_id` and `equipment_id` (together, the primary key), `quantity`.

## Main React Components

- `App` (in `App.jsx`): root component. It holds the authentication state and the message shown after every operation, and it defines all the routes.
- `Layout` (in `Layout.jsx`): shell shared by every page, made of the navigation bar, the message of the last operation, and the content of the current route.
- `LoginForm` and `TotpForm` (in `Auth.jsx`): the form for email and password, and the form for the TOTP code, which is also where a negative score goes back to zero.
- `Home` (in `Home.jsx`): public home page. It loads the facilities and the equipment once, shows them in a card per facility type and in an availability table.
- `Book` (in `Book.jsx`): page that creates a reservation, with a card to choose the facility and a card to choose the equipment. It handles the manual/automatic choice of the facility and the rules that depend on the score of the user.
- `EquipmentRow` (in `EquipmentRow.jsx`): one editable line of equipment, with the +/- controls. It holds no rule: the limits are computed by the parent, which is why it is shared by the booking page and the modification page.
- `Reservations` (in `Reservations.jsx`): list of the reservations of the user, with the actions to modify and delete them.
- `ReservationEdit` (in `ReservationEdit.jsx`): page that modifies the equipment of one reservation. Every item can be increased or decreased, but a mandatory one never below its minimum quantity.

A detailed overview of React Components is available [here](_DOCS/react_components/react-components-overview.md).

## Screenshot

![Screenshot of the booking page](./img/booking.png)

## Users Credentials

The 2FA secret is the same for every user and it is stored separately for each of them in the database. All the users can therefore log in with the second factor and, by doing so, bring a negative score back to zero.

| Email | Password | Characteristics |
| --- | --- | --- |
| <s363290@studenti.polito.it> | Password1! | No reservation, score 0 |
| <user2@example.com> | Password2! | One active reservation (tennis court T1), score 0 |
| <user3@example.com> | Password3! | One active reservation (basketball court B1), one cancelled, score -1 |
| <user4@example.com> | Password4! | Two active reservations (volleyball court V1, table tennis table P1), two cancelled, score -2 |
