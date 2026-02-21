/**
 * Shared category groups matching the web UI.
 * Used in AddExpenseScreen and ExpensesScreen for dropdown pickers.
 */
export const CATEGORY_GROUPS: Record<string, string[]> = {
    Home: ['Rent', 'Electronics', 'Furniture', 'Household supplies', 'Maintenance', 'Mortgage', 'Pets', 'Services', 'Other'],
    Transportation: ['Gas/fuel', 'Car', 'Parking', 'Plane', 'Bicycle', 'Bus/Train', 'Taxi', 'Hotel', 'Other'],
    'Food & Drink': ['Groceries', 'Dining out', 'Liquor', 'Other'],
    Entertainment: ['Movies', 'Games', 'Music', 'Sports', 'Other'],
    Life: ['Medical expenses', 'Insurance', 'Taxes', 'Education', 'Childcare', 'Clothing', 'Gifts', 'Other'],
    Other: ['Services', 'General', 'Electronics'],
    Utilities: ['Heat/gas', 'Electricity', 'Water', 'Cleaning', 'Trash', 'TV/Phone/Internet', 'Other'],
};

export const MAIN_CATEGORIES = Object.keys(CATEGORY_GROUPS);

/** Find the main category that contains a given subcategory */
export function findMainCategory(sub: string): string {
    return (
        MAIN_CATEGORIES.find((m) => CATEGORY_GROUPS[m].includes(sub)) ||
        MAIN_CATEGORIES[0]
    );
}
