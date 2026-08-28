import { Container, Row, Col, Alert } from "react-bootstrap";
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
	// The prop is destructured here so that the effect below refers to this single
	// function and not to the whole props object.
	const { handleErrors } = props;

	// facilityGroups: the facilities grouped by type, i.e.
	// [{ facilityTypeId, facilityTypeName, free, totalCount, freeCodes }, ...]
	const [facilityGroups, setFacilityGroups] = useState([]);
	// equipmentList: the full list of the equipment of the sport center, i.e.
	// [{ id, name, facilityTypeId, facilityTypeName, availableQuantity, totalQuantity, minQuantity }, ...]
	const [equipmentList, setEquipmentList] = useState([]);

	// ---- Load the facilities and the equipment, once, when the page mounts ----
	// The whole equipment list is requested ONCE here, and then distributed to the
	// cards: this is why FacilityCard does not perform any request of its own.
	useEffect(() => {
		API.getFacilities()
			.then((facilities) => {
				// Group the facilities by type with the utility function, and save
				// the result in the state.
				const groups = groupFacilitiesByType(facilities);
				setFacilityGroups(groups);
			})
			.catch((err) => handleErrors(err));

		API.getEquipment()
			.then((equipment) => setEquipmentList(equipment))
			.catch((err) => handleErrors(err));
		// handleErrors is deliberately NOT listed among the dependencies: it is
		// re-created at every render of App, so listing it would make these fetches
		// run again at every render of the parent. Its behaviour never changes
		// (it only calls setMessage), so the captured version is always equivalent.
	}, []);

	// Whether to show the "guest" notice is decided before the return, with a
	// standard if. It is shown only when the user is NOT logged in.
	let guestAlert = null;
	if (!props.loggedIn) {
		guestAlert = (
			<Alert variant="secondary">
				Browsing as <strong>guest</strong>: you can see the availability, but
				you need to log in to book.
			</Alert>
		);
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
			<Row xs={1} sm={2} lg={3} className="g-3 mb-5">
				{/*
					One FacilityCard per group of facilities. Every card also receives
					the equipment of its own type, obtained by filtering the list that
					has already been fetched: no additional request is needed.
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

			<h2 className="mb-3 pb-2 border-bottom">Equipment availability</h2>
			<EquipmentTable equipmentList={equipmentList} />
		</Container>
	);
}

export default Home;
