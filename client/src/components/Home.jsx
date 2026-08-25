import { Container, Row, Col } from "react-bootstrap";
import { useEffect, useState } from "react";

import API from "../API.js";
import groupFacilitiesByType from "../utils.js";
import FacilityCard from "./FacilityCard.jsx";

function Home() {
	const [facilityGroups, setFacilityGroups] = useState([]);

	useEffect(() => {
		API.getFacilities()
			.then((facilities) => {
                // Retrieve the grouped facilities by type using the utility function
                // and setting the state
				const groups = groupFacilitiesByType(facilities);
				setFacilityGroups(groups);
			})
			.catch((err) => {
				console.error("Error fetching facilities:", err);
			});
	}, []); // The empty array means that the call is executed only at the first mount
    
	return (
		<Container fluid>
			<Row className="g-3 align-items-center mb-3">
				<Col xs={12} lg={8}>
					<h1>Disponibilità impianti e attrezzatura</h1>
					<p className="text-muted">
						Dati pubblici, aggiornati in tempo reale. Non è richiesto l'accesso
						per consultarli.
					</p>
				</Col>
			</Row>

			<h2>Impianti per tipologia</h2>
			<Row xs={1} sm={2} lg={3} className="g-3 mb-4"></Row>

			<h2>Attrezzatura disponibile</h2>
			{/* qui andrà la tabella equipment */}
		</Container>
	);
}

export default Home;
