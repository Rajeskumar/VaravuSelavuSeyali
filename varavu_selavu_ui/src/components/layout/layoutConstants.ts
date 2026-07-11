/**
 * TS-DES-210 desktop shell layout constants — shared by App.tsx (header AppBar/Toolbar),
 * MainLayout.tsx (content column height), and Footer.tsx (footer height) so the three chrome
 * pieces agree on their own dimensions instead of each hardcoding a number that could drift.
 * `desktopSidebarWidth` lives in SideNav.tsx alongside the existing `drawerWidth` (mobile) export
 * instead of here, since both are Drawer-specific.
 */
export const HEADER_HEIGHT = 58;
export const FOOTER_HEIGHT = 44;
