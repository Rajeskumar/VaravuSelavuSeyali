/**
 * CardsScreen.tsx — Account → Cards & accounts. Hosts the card wallet + Card Coach that used to be a
 * fifth Insights tab (the V2 design puts cards under Account, not Insights).
 */
import React from 'react';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import CardsTabContent from '../components/CardsTabContent';

export default function CardsScreen() {
  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Cards & accounts" back />
      <CardsTabContent />
    </ScreenWrapper>
  );
}
