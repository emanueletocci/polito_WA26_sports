/* Script di test manuale - NON fa parte del progetto finale, serve solo per verificare i DAO.
   Esegui con: node test-dao.mjs
   Assicurati che database.db sia nella stessa cartella (o aggiorna il path in db.mjs). */

import userDao from "../dao-users.mjs";
import facilityDao from "../dao-facilities.mjs";
import reservationDao from "../dao-reservations.mjs";

async function main() {
	console.log("=== Test connessione DB + DAO ===\n");

	try {
		console.log("--- getFreeFacilities() ---");
		const freeFacilities = await facilityDao.getFreeFacilities();
		console.log(freeFacilities);

		console.log("--- getReservedFacilities() ---");
		const reservedFacilities = await facilityDao.getReservedFacilities();
		console.log(reservedFacilities);

		console.log("\n--- getAllFacilityTypes() ---");
		const facilityTypes = await facilityDao.getAllFacilityTypes();
		console.log(facilityTypes);

		console.log('\n--- getFacilityByCode("T1") ---');
		const facility = await facilityDao.getFacilityByCode("T1");
		console.log(facility);

		console.log("\n--- getOneFreeFacilityByType(1) [tennis] ---");
		const oneFree = await facilityDao.getOneFreeFacilityByType(1);
		console.log(oneFree);

		console.log("\n--- getEquipmentById(1) [tennis] ---");
		const equipment = await facilityDao.getEquipmentById(1);
		console.log(equipment);

		console.log("\n--- getEquipmentAvailability() ---");
		const equipmentAvailability = await facilityDao.getEquipmentAvailability();
		console.log(equipmentAvailability);

		console.log("\n--- getEquipmentRulesForFacilityType(1) [tennis] ---");
		const rules = await facilityDao.getEquipmentRulesForFacilityType(1);
		console.log(rules);

		console.log("\n--- getUser (credenziali corrette) ---");
		const validUser = await userDao.getUser(
			"s363290@studenti.polito.it",
			"Password1!",
		);
		console.log(validUser);

		console.log("\n--- getUser (password sbagliata, deve dare false) ---");
		const invalidUser = await userDao.getUser(
			"user2@example.com",
			"wrongpassword",
		);
		console.log(invalidUser);

		console.log("\n--- getUserById(1) ---");
		const userById1 = await userDao.getUserById(1);
		console.log(userById1);

		console.log("\n--- getUserById(2) ---");
		const userById2 = await userDao.getUserById(2);
		console.log(userById2);
    
		console.log("\n--- getUserById(3) ---");
		const userById3 = await userDao.getUserById(3);
		console.log(userById3);

		console.log("\n--- getUserById(4) ---");
		const userById4 = await userDao.getUserById(4);
		console.log(userById4);

		console.log("\n--- getActiveReservationsByUser(4) ---");
		const activeReservations =
			await reservationDao.getActiveReservationsByUser(4);
		console.log(activeReservations);

		console.log("\n--- getReservationById(1) ---");
		const reservation = await reservationDao.getReservationById(1);
		console.log(reservation);

		console.log(
			"\n--- getReservationById(9999) [inesistente, deve dare error] ---",
		);
		const missingReservation = await reservationDao.getReservationById(9999);
		console.log(missingReservation);

		console.log("\n--- getRentsByReservation(1) ---");
		const rents = await reservationDao.getRentsByReservation(1);
		console.log(rents);

		console.log(
			"\n--- getLastReleaseTime(2, 1) [tennis, prima di ogni cancellazione, deve essere undefined] ---",
		);
		const lastReleaseBefore = await reservationDao.getLastReleaseTime(2, 1);
		console.log(lastReleaseBefore);

		console.log(
			"\n--- Creo e cancello una prenotazione di prova per testare getLastReleaseTime ---",
		);
		const tempReservationId = await reservationDao.createReservation(2, "T2");
		console.log("Prenotazione di prova creata con id:", tempReservationId);
		await reservationDao.cancelReservation(tempReservationId);
		console.log("Prenotazione", tempReservationId, "cancellata");

		console.log(
			"\n--- getLastReleaseTime(2, 1) [tennis, dopo la cancellazione, deve avere un timestamp] ---",
		);
		const lastReleaseAfter = await reservationDao.getLastReleaseTime(2, 1);
		console.log(lastReleaseAfter);

		console.log(
			"\n--- Verifica calcolo secondi trascorsi in JS (occhio al fuso orario UTC) ---",
		);
		const releasedAt = new Date(lastReleaseAfter + "Z");
		const secondsPassed = (Date.now() - releasedAt) / 1000;
		console.log("Secondi trascorsi dal rilascio:", secondsPassed.toFixed(2));

		console.log("\n=== Tutti i test completati senza errori ===");
	} catch (err) {
		console.error("ERRORE durante il test:", err);
	}
}

main();
