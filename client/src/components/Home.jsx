import { Container, Row, Col, Alert, Button } from "react-bootstrap";
import { Link } from "react-router";
import { useEffect, useState } from "react";

import API from "../API.js";
import { groupFacilitiesByType } from "../utils.js";
import FacilityCard from "./FacilityCard.jsx";
import EquipmentTable from "./EquipmentTable.jsx";

function Home({ loggedIn }) {
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
		<Container fluid className="p-3">
			<Row className="mb-4">
				<Col>
					<h1 className="mb-1">Facility and equipment availability</h1>
					<p className="text-muted mb-0">
						Browse facilities by type and current equipment stock.
					</p>
				</Col>
			</Row>

			{!loggedIn && (
				<Alert
					variant="secondary"
					className="d-flex justify-content-between align-items-center"
				>
					<div>
						Browsing as <strong>guest</strong>: you can see availability but not
						book.
					</div>
				</Alert>
			)}

			<h2 className="mb-3 pb-2 border-bottom">Facilities By Type</h2>
			<Row xs={1} sm={2} lg={3} className="g-3 mb-5">
				{facilityGroups.map((f) => (
					<Col key={f.facilityTypeId}>
						<FacilityCard group={f} />
					</Col>
				))}
			</Row>

			<h2 className="mb-3 pb-2 border-bottom">Equipment Availability</h2>
			<EquipmentTable equipmentList={equipmentList} />
		</Container>
	);
}

export default Home;
