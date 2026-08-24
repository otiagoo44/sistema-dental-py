import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.jsx';
import GlobalErrorBoundary from './components/feedback/GlobalErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </MotionConfig>
  </React.StrictMode>,
);
