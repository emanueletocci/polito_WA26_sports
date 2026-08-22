# Exam #1234: "Exam Title"

## Student: s363290 TOCCI EMANUELE 

## React Client Application Routes

- Route `/`: page content and purpose
- Route `/something/:param`: page content and purpose, param specification
- ...

## API Server

- POST `/api/login`
  - request parameters and request body content
  - response body content
- GET `/api/something`
  - request parameters
  - response body content
- POST `/api/something`
  - request parameters and request body content
  - response body content
- ...

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
