import { Container, Row, Col } from "react-bootstrap";
import { useEffect, useState } from "react";

import API from "../API.js";
import { groupFacilitiesByType } from "../utils.js";
import FacilityCard from "./FacilityCard.jsx";
import EquipmentTable from "./EquipmentTable.jsx";

function Home() {
	const [facilityGroups, setFacilityGroups] = useState([]);
	const [equipmentList, setEquipmentList] = useState([]);

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

	useEffect(() => {
		API.getEquipment()
			.then((eq) => {
				setEquipmentList(eq);
			})
			.catch((err) => {
				console.error("Error fetching equipment:", err);
			});
	}, []);

	return (
		<Container fluid>
			<Row className="g-3 align-items-center mb-3">
				<h1>Facility and equipment availability</h1>
			</Row>

			<h2>Facilities by type</h2>
			<Row xs={1} sm={2} lg={3} className="g-3 mb-4">
				{facilityGroups.map((f) => (
					<Col key={f.facilityTypeId}>
						<FacilityCard group={f} />
					</Col>
				))}
			</Row>

			<h2>Available equipment</h2>
			<EquipmentTable equipmentList={equipmentList} />
		</Container>
	);
}

export default Home;
