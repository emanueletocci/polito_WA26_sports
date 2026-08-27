const SERVER_URL = "http://localhost:3001/api/";

/**
 * A utility function for parsing the HTTP response.
 *
 * INPUT (params, positional):
 * - httpResponsePromise: a Promise returned by fetch(...)
 *
 * OUTPUT (return value):
 * - a new Promise that:
 *   - resolves with the parsed JSON body, if the HTTP response was ok (2xx)
 *   - rejects in every other case
 */
function getJson(httpResponsePromise) {
	// server API always return JSON, in case of error the format is the following { error: <message> }
	return new Promise((resolve, reject) => {
		httpResponsePromise
			.then((response) => {
				// The fetch promise is rejected only in case of network errors. If the server returns a 4xx or 5xx error, the promise is resolved and it is up to the code to check response.ok and eventually reject.
				if (response.ok) {
					// the server always returns a JSON, even empty {}. Never null or non json, otherwise the method will fail
					response
						.json()
						.then((json) => resolve(json))
						.catch((err) => reject({ error: "Cannot parse server response" }));
				} else {
					// analyzing the cause of error and rejecting the promise
					response
						.json()
						.then((obj) => reject(obj)) // error msg in the response body
						.catch((err) => reject({ error: "Cannot parse server response" })); // something else
				}
			})
			.catch((err) => reject({ error: "Cannot communicate" })); // connection error
	});
}

/**
 * Getting from the server side the list of facilities, each with its type and status (isBooked).
 * Optional "status" filter ("free" | "booked"); without it, returns ALL facilities -
 * needed by the public homepage to compute per-type counts (free/booked/total).
 *
 * INPUT:
 * - status: optional string, either "free" or "booked". If omitted (undefined),
 *   the server returns every facility regardless of status.
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the array of facility objects,
 *   or rejects with { error: <message> }
 */
const getFacilities = async (status) => {
	// credentials: 'include' forces the browser to send the session cookie even though
	// client (5173) and server (3001) are different origins - required for session-based auth to work.
	return getJson(
		status
			? fetch(
					SERVER_URL + "facilities?status=" + status,
					// init object for fetch() specifying that the authentication cookie must be forwarded
					{
						credentials: "include",
					},
				)
			: fetch(SERVER_URL + "facilities", { credentials: "include" }),
	);
};

/**
 * Getting from the server side the list of all facility types.
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the array of facility type
 *   objects, or rejects with { error: <message> }
 */
const getFacilityTypes = async () => {
	return getJson(
		fetch(SERVER_URL + "facility-types", { credentials: "include" }),
	);
};

/**
 * Getting from the server side the list of equipment.
 * Optional "facilityTypeId" filter: returns only the equipment rules (with minQuantity)
 * relevant to that facility type - used by the reservation form.
 * Without it, returns ALL equipment with availability - used by the public homepage.

 * INPUT (params, positional):
 * - facilityTypeId: optional number, the id of a facility type. If provided
 *   (including 0), the server returns only the equipment rules for that type.
 *   If omitted (undefined), the server returns the full equipment list.
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the array of equipment objects,
 *   or rejects with { error: <message> }
 */
const getEquipment = async (facilityTypeId) => {
	return getJson(
		// explicitly check if a facilityTypeId is specified, to manage the case of 0 (falsy) as a valid value.
		facilityTypeId !== undefined
			? fetch(SERVER_URL + "equipment?facilityTypeId=" + facilityTypeId, {
					credentials: "include",
				})
			: fetch(SERVER_URL + "equipment", { credentials: "include" }),
	);
};

/**
 * Getting from the server side the list of reservations belonging to the logged-in user.
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the array of the current user's
 *   reservation objects, or rejects with { error: <message> }
 */
const getReservations = async () => {
	return getJson(
		fetch(SERVER_URL + "reservations", { credentials: "include" }),
	);
};

/**
 * Sending a new reservation object to the server to book a facility (and optional equipment).
 *
 * INPUT (params, positional):
 * - reservation: object describing the reservation to create, e.g.
 *   { facilityTypeId, facilityCode?, equipment: [{ equipmentId, quantity }, ...] }
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the server's JSON response
 *   (typically the created reservation), or rejects with { error: <message> }
 */
const createReservation = async (reservation) => {
	return getJson(
		fetch(SERVER_URL + "reservations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(reservation),
		}),
	);
};

/**
 * Asking the server to cancel/delete the reservation identified by "reservationId".
 *
 * INPUT (params, positional):
 * - reservationId: the id of the reservation to delete
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves once the reservation is deleted,
 *   or rejects with { error: <message> }
 */
const deleteReservation = async (reservationId) => {
	return getJson(
		fetch(SERVER_URL + "reservations/" + reservationId, {
			method: "DELETE",
			credentials: "include",
		}),
	);
};

// -----------------------------------------------------------------------------
// AUTH FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * This function wants the TOTP code
 * It executes the 2FA.
 *
 * INPUT (params, positional):
 * - totpCode: string, the 6-digit code typed by the user
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves once the TOTP code is verified
 *   (session becomes fully authenticated), or rejects with { error: <message> }
 */
const totpVerify = async (totpCode) => {
	return getJson(
		fetch(SERVER_URL + "login-totp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include", // this parameter specifies that authentication cookie must be forwarded
			body: JSON.stringify({ code: totpCode }),
		}),
	);
};

/**
 * This function wants username and password inside a "credentials" object.
 * It executes the log-in.
 *
 * INPUT (params, positional):
 * - credentials: object { email, password }
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the logged-in user's info,
 *   or rejects with { error: <message> }
 */
const logIn = async (credentials) => {
	return getJson(
		fetch(SERVER_URL + "sessions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include", // this parameter specifies that authentication cookie must be forwarded
			body: JSON.stringify(credentials),
		}),
	);
};

/**
 * This function is used to verify if the user is still logged-in.
 * It returns a JSON object with the user info.
 *
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves to the current user's info if a
 *   valid session exists, or rejects with { error: <message> } otherwise
 */
const getUserInfo = async () => {
	return getJson(
		fetch(SERVER_URL + "sessions/current", {
			// this parameter specifies that authentication cookie must be forwarded
			credentials: "include",
		}),
	);
};

/**
 * This function destroy the current user's session and execute the log-out.
 *
 *
 * OUTPUT (return value):
 * - a Promise (via getJson) that resolves once the session is destroyed,
 *   or rejects with { error: <message> }
 */
const logOut = async () => {
	return getJson(
		fetch(SERVER_URL + "sessions/current", {
			method: "DELETE",
			credentials: "include", // this parameter specifies that authentication cookie must be forwarded
		}),
	);
};

const API = {
	getFacilities,
	getFacilityTypes,
	getEquipment,
	logIn,
	getUserInfo,
	logOut,
	totpVerify,
	getReservations,
	createReservation,
	deleteReservation,
};
export default API;
