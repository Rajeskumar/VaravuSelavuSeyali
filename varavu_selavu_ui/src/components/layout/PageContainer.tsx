import React from 'react';
import Container, { ContainerProps } from '@mui/material/Container';

interface PageContainerProps extends Omit<ContainerProps, 'maxWidth'> {
  /** Default 'lg' — matches every authenticated app page. */
  maxWidth?: ContainerProps['maxWidth'];
  /** Vertically + horizontally centers content, viewport-height minus the app bar — for
   * single-card pages (auth forms, join-group) that previously each reimplemented this
   * inline (TS-GRP-140). */
  center?: boolean;
}

/**
 * Shared page-content wrapper (TS-GRP-140) — used by every page, public and authenticated
 * alike, so container width is one decision made in one place instead of each page picking
 * its own maxWidth (or none at all) independently. Forwards any other `Container` prop
 * (`id`, etc.) unchanged.
 */
const PageContainer: React.FC<PageContainerProps> = ({ children, maxWidth = 'lg', center = false, sx, ...rest }) => {
  return (
    <Container
      maxWidth={maxWidth}
      sx={{
        ...(center && {
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }),
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Container>
  );
};

export default PageContainer;
