import {createRoot} from 'react-dom/client';
import Dashboard from './app/dashboard';
import LoginForm from './app/login/login-form';
import './app/globals.css';
createRoot(document.getElementById('app')!).render(window.location.pathname==='/login'?<LoginForm/>:<Dashboard/>);
