**Role:**
Act as a Senior Mobile App Developer (React Native/Expo) and Backend Engineer.

**Context:**
We are overhauling the core navigation architecture of our mobile Expense Application to improve UX and align with standard mobile design patterns. We also need to implement secondary screens and generalize our backend email API.

**Task 1: Bottom Tab Navigation Revamp**
* **Issue:** The current bottom menu bar has alignment issues and is cluttered.
* **Requirement:** Completely rebuild the Bottom Tab Navigator to have exactly 5 distinct items in this specific order:
    1.  **Home**
    2.  **History**
    3.  **Add Expense** (This must be the center item. Style this as a prominent, elevated Floating Action Button (FAB) or a distinct visually centered button that breaks the top border of the tab bar).
    4.  **Stats**
    5.  **AI Analyst**
* **Constraint:** Ensure the icons and text labels are perfectly aligned vertically and horizontally. 

**Task 2: Hamburger Menu (Drawer Navigation)**
* **Requirement:** Implement a Drawer Navigator (Hamburger Menu) accessible from the main screens. Ensure the navigation nesting is correct so the hamburger icon appears in the top header of the Bottom Tab screens.
* **Drawer Items:**
    * **About App:** A simple screen explaining the app's purpose and version details.
    * **Submit Feature Request:** A form allowing users to submit ideas (mirroring the Web UI).
    * **Contact Us:** A standard contact form (Name, Subject, Message).
    * **Logout:** Pin this item to the absolute bottom of the drawer.

**Task 3: Backend API Generalization for Emails**
* **Context:** We currently have a backend flow for submitting feature requests via email. We now need to support the "Contact Us" form as well.
* **Requirement:** * Update the existing backend API endpoint (or create a new unified generic endpoint) that handles sending emails.
    * The API should accept a generic payload (e.g., `formType`, `userEmail`, `subject`, `messageBody`) so that both the "Submit Feature Request" and "Contact Us" forms can hit the exact same endpoint without needing duplicate backend logic.
    * Wire up the mobile UI forms to use this updated API endpoint.

**Deliverables:**
1.  The updated Navigation routing file (showing how the Drawer and Bottom Tabs are nested).
2.  The code for the custom-styled Bottom Tab Bar (specifically the centered "Add Expense" button).
3.  The code for the updated backend email API controller/route.