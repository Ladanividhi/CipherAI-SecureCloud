import React from 'react';
import { statusLabels } from '../utils/constants';

export default function StatusPill({ status }) {
  if (!status) return null;
  const label = statusLabels[status] || status;
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
