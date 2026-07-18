/**
 * Vereinsverwaltung – Support und Anregungen
 */

import {
  apiPost
} from './api.js';

const SUPPORT_ADDRESS = 'sd-media@t-online.de';
const CLIENT_ID_KEY = 'vereinsverwaltung_support_client_id';

export function renderSupportPage(options) {
  const {
    contentElement,
    setPageHeading
  } = options;

  setPageHeading(
    'Support & Anregungen',
    'Hilfe erhalten und Verbesserungsvorschläge übermitteln'
  );

  contentElement.innerHTML = `
    <section class="support-layout">
      <article class="panel-card support-contact-card">
        <span class="eyebrow">Direkter Kontakt</span>
        <h2>Support</h2>
        <p>
          Bei technischen Problemen oder Fragen zur Vereinsverwaltung
          erreichst du den Support per E-Mail.
        </p>
        <a class="button button-secondary support-email-link" href="mailto:${SUPPORT_ADDRESS}">
          ${SUPPORT_ADDRESS}
        </a>
      </article>

      <article class="panel-card support-feedback-card">
        <span class="eyebrow">Weiterentwicklung</span>
        <h2>Anregung oder Tool-Vorschlag senden</h2>
        <p>
          Beschreibe, was verbessert werden könnte oder welches neue Tool
          die Vereinsplattform künftig ergänzen sollte.
        </p>

        <form id="supportFeedbackForm" class="dialog-form support-feedback-form">
          <div class="form-grid-two">
            <label class="form-field">
              <span>Name <small>optional</small></span>
              <input name="name" maxlength="120" autocomplete="name">
            </label>

            <label class="form-field">
              <span>E-Mail für Rückfragen <small>optional</small></span>
              <input name="email" type="email" maxlength="180" autocomplete="email">
            </label>
          </div>

          <label class="form-field">
            <span>Betreff</span>
            <input name="subject" maxlength="140" required placeholder="Zum Beispiel: Verbesserung der Listenansicht">
          </label>

          <label class="form-field">
            <span>Anregung</span>
            <textarea name="message" rows="9" minlength="10" maxlength="5000" required placeholder="Beschreibe deinen Vorschlag möglichst konkret …"></textarea>
          </label>

          <label class="support-honeypot" aria-hidden="true">
            <span>Website</span>
            <input name="website" tabindex="-1" autocomplete="off">
          </label>

          <div id="supportFeedbackMessage" class="form-error" hidden></div>

          <div class="dialog-actions support-form-actions">
            <button class="button button-primary" type="submit">
              Anregung absenden
            </button>
          </div>
        </form>
      </article>
    </section>
  `;

  const form = contentElement.querySelector('#supportFeedbackForm');
  const messageBox = contentElement.querySelector('#supportFeedbackMessage');

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    data.clientId = getSupportClientId_();

    button.disabled = true;
    button.textContent = 'Wird gesendet …';
    messageBox.hidden = true;
    messageBox.classList.remove('is-success');

    try {
      const result = await apiPost('submitsupport', { data });
      form.reset();
      messageBox.textContent = result && result.message
        ? result.message
        : 'Vielen Dank. Deine Anregung wurde übermittelt.';
      messageBox.classList.add('is-success');
      messageBox.hidden = false;
    } catch (error) {
      messageBox.textContent = error && error.message
        ? error.message
        : 'Die Anregung konnte nicht gesendet werden.';
      messageBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Anregung absenden';
    }
  });
}

function getSupportClientId_() {
  let value = String(localStorage.getItem(CLIENT_ID_KEY) || '').trim();

  if (!value) {
    value = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(CLIENT_ID_KEY, value);
  }

  return value;
}
