import { createRoot } from 'react-dom/client';
import '../../ui/styles.css';
import '../../ui/page-fonts.css';
import './popup.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
