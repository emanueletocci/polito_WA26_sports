import { Container, Row, Col, Alert, Spinner } from "react-bootstrap";
import { useState, useEffect } from "react";

import API from "../API.js";
import { groupFacilitiesByType } from "../utils.js";
import FacilityCard from "./FacilityCard.jsx";
import EquipmentTable from "./EquipmentTable.jsx";

/**
 * Home
 *
 * INPUT (props, passed as a single object):
 * - loggedIn: boolean, whether the current user is authenticated. It is used
 *   only to decide whether to show the "browsing as guest" notice.
 * - handleErrors: function(err), shows the reason of a failed operation
 *
 * OUTPUT (return value):
 * - JSX: the public home page, showing the facilities grouped by type (a grid of
 *   FacilityCard components) and the availability of every equipment type
 */
function Home(props) {
	// The prop is destructured here
	const { handleErrors } = props;

	// facilityGroups: the facilities grouped by type, i.e.
	// [{ facilityTypeId, facilityTypeName, free, totalCount, freeCodes }, ...]
	const [facilityGroups, setFacilityGroups] = useState([]);
	// equipmentList: the full list of the equipment of the sport center, i.e.
	// [{ id, name, facilityTypeId, facilityTypeName, availableQuantity, totalQuantity, minQuantity }, ...]
	const [equipmentList, setEquipmentList] = useState([]);

	// Two state to track whether the two fetches are still in progress. The page shows a spinner until both are completed, and then shows the content.
	const [waitingFacilities, setWaitingFacilities] = useState(true);
	const [waitingEquipment, setWaitingEquipment] = useState(true);

	// The whole equipment list is requested once here, and then distributed to the
	// cards.
	useEffect(() => {
		API.getFacilities()
			.then((facilities) => {
				// Group the facilities by type with the utility function, and save
				// the result in the state.
				const groups = groupFacilitiesByType(facilities);
				setFacilityGroups(groups);
			})
			.catch((err) => handleErrors(err))
			.finally(() => setWaitingFacilities(false));

		API.getEquipment()
			.then((equipment) => setEquipmentList(equipment))
			.catch((err) => handleErrors(err))
			.finally(() => setWaitingEquipment(false));
	}, []);

	// A single boolean flag for both sections. The page shows a spinner until both fetches are completed, and then shows the content.
	const waiting = waitingFacilities || waitingEquipment;

	// If the user is not logged in, show a notice that he is browsing as guest and cannot book.
	let guestAlert = null;
	if (!props.loggedIn) {
		guestAlert = (
			<Alert variant="secondary">
				Browsing as <strong>guest</strong>: you can see the availability, but
				you need to log in to book.
			</Alert>
		);
	}

	// The grid of the cards, or a spinner while the two lists are being loaded.
	let facilitiesContent;
	if (waiting) {
		facilitiesContent = <Spinner />;
	} else {
		facilitiesContent = (
			<Row xs={1} sm={2} lg={3} className="g-3 mb-5">
				{/*
					One FacilityCard per group of facilities. Every card also receives
					the equipment of its own type, obtained by filtering the list that
					has already been fetched.
				*/}
				{facilityGroups.map((group) => (
					<Col key={group.facilityTypeId}>
						<FacilityCard
							group={group}
							equipmentRules={equipmentList.filter(
								(eq) => eq.facilityTypeId === group.facilityTypeId,
							)}
						/>
					</Col>
				))}
			</Row>
		);
	}

	// The availability table, or a spinner while it is being loaded.
	let equipmentContent;
	if (waiting) {
		equipmentContent = <Spinner />;
	} else {
		equipmentContent = <EquipmentTable equipmentList={equipmentList} />;
	}

	return (
		<Container fluid className="p-3">
			<Row className="mb-4">
				<Col>
					<h1 className="mb-1">Facility and equipment availability</h1>
					<p className="text-muted mb-0">
						Browse the facilities by type and the current equipment stock.
					</p>
				</Col>
			</Row>

			{guestAlert}

			<h2 className="mb-3 pb-2 border-bottom">Facilities by type</h2>
			{facilitiesContent}

			<h2 className="mb-3 pb-2 border-bottom">Equipment availability</h2>
			{equipmentContent}
		</Container>
	);
}

export default Home;
