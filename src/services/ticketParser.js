/**
 * Parseur et validateur universel de billets CiviCRM (QR Codes, URLs, Tokens, JWT, IDs)
 */

export const parseTicketCode = (rawCode, currentEventId) => {
    const raw = String(rawCode || '').trim();
    if (!raw) return { isValid: false, reason: 'empty' };

    // 1. Détection URL CiviCRM
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('/civicrm/') || raw.startsWith('civiscan://')) {
        try {
            const urlString = raw.startsWith('civiscan://') ? raw.replace('civiscan://', 'https://civiscan.local/') : raw;
            const url = new URL(urlString);
            const params = url.searchParams;

            const urlEventId = params.get('eventId') || params.get('event_id') || params.get('id') || params.get('eid');
            const urlParticipantId = params.get('participantId') || params.get('participant_id') || params.get('p') || params.get('pid');
            const urlContactId = params.get('contactId') || params.get('contact_id') || params.get('c') || params.get('cid');
            const checksum = params.get('cs');

            if (urlEventId && Number(urlEventId) !== Number(currentEventId)) {
                return {
                    isValid: false,
                    isWrongEvent: true,
                    ticketEventId: Number(urlEventId),
                    currentEventId: Number(currentEventId),
                    reason: 'wrong_event'
                };
            }

            return {
                isValid: true,
                cleanCode: urlParticipantId || checksum || raw,
                participantId: urlParticipantId ? Number(urlParticipantId) : null,
                contactId: urlContactId ? Number(urlContactId) : null,
                checksum: checksum || null,
            };
        } catch {
            // Ignorer si échec de parsing URL
        }
    }

    // 2. Détection JWT ou token signé
    if (raw.split('.').length === 3) {
        try {
            const parts = raw.split('.');
            const payload = JSON.parse(atob(parts[1]));
            const tokenEventId = payload.eventId || payload.event_id || payload.eid;
            if (tokenEventId && Number(tokenEventId) !== Number(currentEventId)) {
                return {
                    isValid: false,
                    isWrongEvent: true,
                    ticketEventId: Number(tokenEventId),
                    currentEventId: Number(currentEventId),
                    reason: 'wrong_event'
                };
            }
            return {
                isValid: true,
                cleanCode: raw,
                participantId: payload.participantId || payload.pid ? Number(payload.participantId || payload.pid) : null,
                contactId: payload.contactId || payload.cid ? Number(payload.contactId || payload.cid) : null,
            };
        } catch {
            // Ignorer si échec de parsing JWT
        }
    }

    // 3. Détection format composé "EVT{eventId}-P{participantId}" ou "E{id}_P{id}"
    const evtMatch = raw.match(/^[eE](?:vt)?[-_:]?(\d+)[-_:][pP](?:art)?[-_:]?(\d+)$/);
    if (evtMatch) {
        const parsedEventId = Number(evtMatch[1]);
        const parsedParticipantId = Number(evtMatch[2]);
        if (parsedEventId !== Number(currentEventId)) {
            return {
                isValid: false,
                isWrongEvent: true,
                ticketEventId: parsedEventId,
                currentEventId: Number(currentEventId),
                reason: 'wrong_event'
            };
        }
        return {
            isValid: true,
            cleanCode: String(parsedParticipantId),
            participantId: parsedParticipantId,
        };
    }

    // 4. Code brut numérique ou texte
    return {
        isValid: true,
        cleanCode: raw,
        participantId: /^\d+$/.test(raw) ? Number(raw) : null,
    };
};
