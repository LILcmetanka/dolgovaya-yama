import './style.css';
import { createGame } from './game/config';
import { setupPhoneShell } from './game/parts/rotateHint';

createGame('game');
setupPhoneShell();
