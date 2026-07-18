/**
 * Vereinsverwaltung – Mitteilungen und Postfach
 */

import {
  apiPost
} from './api.js';

import {
  getStoredToken
} from './auth.js';

const POPUP_SESSION_PREFIX = 'vereinsverwaltung_message_popup_';

export async function bindAdminMailbox(contentElement) {
  const button = contentElement.querySelector('#adminMailboxButton');
  const badge = contentElement.querySelector('#adminMailboxBadge');

  if (!button) {
    return;
  }

  button.addEventListener('click', () => openMailbox_(contentElement));

  try {
    const messages = await loadMessages_();
    const unread = messages.filter(item => item.read !== true);

    if (badge) {
      badge.hidden = unread.length === 0;
      badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
    }

    if (unread.length) {
      const newest = unread[0];
      const popupKey = POPUP_SESSION_PREFIX + String(newest.id || '');

      if (!sessionStorage.getItem(popupKey)) {
        sessionStorage.setItem(popupKey, '1');
        showMessageDialog_(contentElement, newest, true);
        await markRead_(newest.id);
        newest.read = true;
        if (badge) {
          const remaining = Math.max(0, unread.length - 1);
          badge.hidden = remaining === 0;
          badge.textContent = String(remaining);
        }
      }
    }
  } catch (error) {
    console.warn('Postfach konnte nicht geladen werden.', error);
  }
}

async function openMailbox_(contentElement) {
  const root = getDialogRoot_(contentElement);
  root.innerHTML = `
    <div class="dialog-backdrop">
      <section class="dialog-card mailbox-dialog-card" role="dialog" aria-modal="true" aria-labelledby="mailboxTitle">
        <header class="dialog-header">
          <div><span class="eyebrow">Mitteilungen</span><h2 id="mailboxTitle">Postfach</h2></div>
          <button class="icon-button" type="button" data-close-mailbox>×</button>
        </header>
        <div class="mailbox-loading">Mitteilungen werden geladen …</div>
      </section>
    </div>`;

  bindClose_(root);

  try {
    const messages = await loadMessages_();
    const card = root.querySelector('.mailbox-dialog-card');
    card.innerHTML = `
      <header class="dialog-header">
        <div><span class="eyebrow">Mitteilungen</span><h2 id="mailboxTitle">Postfach</h2></div>
        <button class="icon-button" type="button" data-close-mailbox>×</button>
      </header>
      <div class="mailbox-list">
        ${messages.length
          ? messages.map(renderMailboxItem_).join('')
          : '<div class="admin-empty-note">Noch keine Mitteilungen vorhanden.</div>'}
      </div>
      <div class="dialog-actions"><button class="button button-primary" type="button" data-close-mailbox>Schließen</button></div>`;

    bindClose_(root);

    root.querySelectorAll('[data-open-message]').forEach(button => {
      button.addEventListener('click', async () => {
        const message = messages.find(item => String(item.id) === button.dataset.openMessage);
        if (!message) return;
        showMessageDialog_(contentElement, message, false);
        if (!message.read) {
          await markRead_(message.id);
          message.read = true;
        }
      });
    });
  } catch (error) {
    const loading = root.querySelector('.mailbox-loading');
    if (loading) {
      loading.className = 'form-error';
      loading.textContent = error.message || 'Mitteilungen konnten nicht geladen werden.';
    }
  }
}

function showMessageDialog_(contentElement, message, isNew) {
  const root = getDialogRoot_(contentElement);
  root.innerHTML = `
    <div class="dialog-backdrop">
      <section class="dialog-card mailbox-message-card" role="dialog" aria-modal="true" aria-labelledby="messageDialogTitle">
        <header class="dialog-header">
          <div>
            <span class="eyebrow">${isNew ? 'Neue Mitteilung' : 'Postfach'}</span>
            <h2 id="messageDialogTitle">${escapeHtml_(message.title)}</h2>
          </div>
          <button class="icon-button" type="button" data-close-mailbox>×</button>
        </header>
        <div class="mailbox-message-date">${escapeHtml_(message.createdAtText || message.createdAt || '')}</div>
        <div class="mailbox-message-body">${escapeHtml_(message.message).replace(/\n/g, '<br>')}</div>
        <div class="dialog-actions">
          <button class="button button-secondary" type="button" data-open-full-mailbox>Zum Postfach</button>
          <button class="button button-primary" type="button" data-close-mailbox>Schließen</button>
        </div>
      </section>
    </div>`;

  bindClose_(root);
  const mailboxButton = root.querySelector('[data-open-full-mailbox]');
  if (mailboxButton) {
    mailboxButton.addEventListener('click', () => openMailbox_(contentElement));
  }
}

function renderMailboxItem_(message) {
  return `
    <button class="mailbox-list-item ${message.read ? '' : 'is-unread'}" type="button" data-open-message="${escapeHtml_(message.id)}">
      <span class="mailbox-list-marker" aria-hidden="true"></span>
      <span class="mailbox-list-content">
        <strong>${escapeHtml_(message.title)}</strong>
        <span>${escapeHtml_(message.createdAtText || message.createdAt || '')}</span>
        <small>${escapeHtml_(truncate_(message.message, 130))}</small>
      </span>
    </button>`;
}

async function loadMessages_() {
  const token = getStoredToken();
  if (!token) return [];
  const result = await apiPost('messages', {}, token);
  return Array.isArray(result) ? result : [];
}

async function markRead_(messageId) {
  const token = getStoredToken();
  if (!token || !messageId) return;
  await apiPost('markmessageread', { id: messageId }, token);
}

function getDialogRoot_(contentElement) {
  let root = contentElement.querySelector('#adminDialogRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'adminDialogRoot';
    contentElement.appendChild(root);
  }
  return root;
}

function bindClose_(root) {
  root.querySelectorAll('[data-close-mailbox]').forEach(button => {
    button.addEventListener('click', () => {
      root.innerHTML = '';
    });
  });
}

function truncate_(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
