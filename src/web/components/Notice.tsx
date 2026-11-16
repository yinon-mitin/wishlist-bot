import { useEffect, useState } from 'preact/hooks';
import { currentNotice, subscribeNotice } from '../notice';

export function Notice() {
  const [message, setMessage] = useState(currentNotice());
  useEffect(() => subscribeNotice(setMessage), []);
  return message ? <div class="notice" role="status">{message}</div> : null;
}
