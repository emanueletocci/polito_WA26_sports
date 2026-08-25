const SERVER_URL = "http://localhost:3001/api/";

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * A utility function for parsing the HTTP response.
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
 * Getting from the server side the list of equipment.
 * Optional "facilityTypeId" filter: returns only the equipment rules (with minQuantity)
 * relevant to that facility type - used by the reservation form.
 * Without it, returns ALL equipment with availability - used by the public homepage.
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

// -----------------------------------------------------------------------------
// AUTH FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * This function wants the TOTP code
 * It executes the 2FA.
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
	logIn,
	getUserInfo,
	logOut,
	totpVerify,
};
export default API;
