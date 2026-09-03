// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Groups an array of facilities by facilityTypeId. For each type,
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

function groupFacilitiesByType(facilities) {
	// Reduce iterates through elements, combining the current item with an accumulator value via callback.
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

// Turns a snake_case name into Title Case: replaces underscores with spaces,
// then capitalizes the first letter of every word.
// Example: "table_tennis" -> "Table Tennis", "knee_pads" -> "Knee Pads".
function formatName(name) {
	// Splitting the string into 2 different substrings if _ is present
	const words = name.split("_");
	const capitalizedWords = words.map(
		(word) => word.charAt(0).toUpperCase() + word.slice(1)
	);
	return capitalizedWords.join(" ");
}

export { groupFacilitiesByType, formatName };