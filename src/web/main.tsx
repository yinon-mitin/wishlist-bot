import { render } from 'preact';
import './styles/tokens.css';
import { App } from './App';
import { detectLang, setLang } from './i18n';
import { routeFromStartParam } from './router';
import { initTelegram, startParam, tgUser } from './tg';

initTelegram();
setLang(detectLang(tgUser()?.language_code));
if (!location.hash) location.hash = routeFromStartParam(startParam());
render(<App />, document.getElementById('app')!);
