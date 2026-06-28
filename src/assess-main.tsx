import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssessmentCenter } from './AssessmentCenter';
import './styles.css';
import './assess.css';

createRoot(document.getElementById('assess-root')!).render(
  <StrictMode>
    <AssessmentCenter />
  </StrictMode>,
);
