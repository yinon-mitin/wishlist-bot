import { render } from 'preact';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { detectLang, setLang } from './i18n';
import { initialHash } from './router';
import { initTelegram, startParam, tgUser } from './tg';

initTelegram();
setLang(detectLang(tgUser()?.language_code));
const start = initialHash(location.hash, startParam());
if (start) location.hash = start;
render(<App />, document.getElementById('app')!);
