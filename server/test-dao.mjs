/* Script di test manuale - NON fa parte del progetto finale, serve solo per verificare i DAO.
   Esegui con: node test-dao.mjs
   Assicurati che database.db sia nella stessa cartella (o aggiorna il path in db.mjs). */

import userDao from './dao-users.mjs';
import facilityDao from './dao-facilities.mjs';

async function main() {
  console.log('=== Test connessione DB + DAO ===\n');

  try {
    console.log('--- getFreeFacilities() ---');
    const freeFacilities = await facilityDao.getFreeFacilities();
    console.log(freeFacilities);

    console.log('\n--- getEquipmentAvailability() ---');
    const equipment = await facilityDao.getEquipmentAvailability();
    console.log(equipment);

    console.log('\n--- getEquipmentRulesForFacilityType(1) [tennis] ---');
    const rules = await facilityDao.getEquipmentRulesForFacilityType(1);
    console.log(rules);

    console.log('\n--- getFacilityByCode("T1") ---');
    const facility = await facilityDao.getFacilityByCode('T1');
    console.log(facility);

    console.log('\n--- getOneFreeFacilityByType(1) [tennis] ---');
    const oneFree = await facilityDao.getOneFreeFacilityByType(1);
    console.log(oneFree);

    console.log('\n--- getUser (credenziali corrette) ---');
    const validUser = await userDao.getUser('s363290@studenti.polito.it', 'Password1!');
    console.log(validUser);

    console.log('\n--- getUser (password sbagliata, deve dare false) ---');
    const invalidUser = await userDao.getUser('user2@example.com', 'wrongpassword');
    console.log(invalidUser);

    console.log('\n--- getUserById(2) ---');
    const userById = await userDao.getUserById(2);
    console.log(userById);

    console.log('\n=== Tutti i test completati senza errori ===');
  } catch (err) {
    console.error('ERRORE durante il test:', err);
  }
}

main();
