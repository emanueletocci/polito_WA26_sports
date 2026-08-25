// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Groups a flat array of facilities by facilityTypeId. For each type,
 * computes the total count (free + booked) and collects only the codes
 * of the FREE facilities, to be shown as selectable badges.
 */

/*
facilities = [
  {
    code: "T1",
    isBooked: 0,
    facilityTypeId: 1,
    facilityTypeName: "Tennis"
  },
  {
    code: "T2",
    isBooked: 1,
    facilityTypeId: 1,
    facilityTypeName: "Tennis"
  },
  {
    code: "T3",
    isBooked: 0,
    facilityTypeId: 1,
    facilityTypeName: "Tennis"
  },
  {
    code: "B1",
    isBooked: 0,
    facilityTypeId: 2,
    facilityTypeName: "Basket"
  },
  {
    code: "B2",
    isBooked: 1,
    facilityTypeId: 2,
    facilityTypeName: "Basket"
  }
]
*/
/*
function groupFacilitiesByType(facilities) {
	// Initialize an empty object to hold the grouped facilities
	// Using an object allows us to use facilityTypeId as keys for easy access and grouping
	const groups = {};

	facilities.forEach((facility) => {
		// If the facility type is not yet in the groups object, initialize it
		if (!(facility.facilityTypeId in groups)) {
			groups[facility.facilityTypeId] = {
				facilityTypeId: facility.facilityTypeId,
				facilityTypeName: facility.facilityTypeName,
				totalCount: 0,
				free: 0,
				freeCodes: [], // the array stores the codes of the free facilities, to be shown as selectable badges
			};
		}

		// Select the current group based on the facility type ID
		const currentGroup = groups[facility.facilityTypeId];

		// Perform the necessary calculations and updates for the current group
		currentGroup.totalCount += 1;

		// If the facility is free (isBooked === 0), update the free count and add the code to the freeCodes array
		if (facility.isBooked === 0) {
			currentGroup.free += 1;
			currentGroup.freeCodes.push(facility.code);
		}
	});
	return Object.entries(groups).map(([, group]) => group);
}
*/

export default function groupFacilitiesByType(facilities) {
	// Reduce iterates through elements, combining the current item with an accumulator value via callback `f`.
	// reduce(callback, initialValue) where callback is a function that takes the accumulator and the current item, and initialValue is the starting value for the accumulator.

	return facilities.reduce((groupsAccumulator, facility) => {
		// Check if a group for the current facility type already exists in the accumulator array.
		let group = groupsAccumulator.find(
			(g) => g.facilityTypeId === facility.facilityTypeId,
		);

		if (!group) {
			group = {
				facilityTypeId: facility.facilityTypeId,
				facilityTypeName: facility.facilityTypeName,
				totalCount: 0,
				free: 0,
				freeCodes: [],
			};
			groupsAccumulator.push(group); // add the new group to the accumulator array
		}

		group.totalCount += 1;
		if (facility.isBooked === 0) {
			group.free += 1;
			group.freeCodes.push(facility.code);
		}

		return groupsAccumulator; // the updated accumulator is returned for the next iteration
	}, []); // [] is the initial value for the accumulator, starting with an empty array to hold the grouped facilities.
}

