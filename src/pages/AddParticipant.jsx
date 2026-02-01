import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { civiApi, getSettings } from '../services/civi';
import { ArrowLeft, Search, UserPlus, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AddParticipant = () => {
    const { t } = useTranslation();
    const { eventId } = useParams();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('search'); // search or create
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // New Contact Form
    const [newContact, setNewContact] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: ''
    });

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { apiVersion } = getSettings();
            let params = {};

            if (apiVersion === '4') {
                params = {
                    where: [["sort_name", "LIKE", `%${query}%`]],
                    select: ["id", "display_name", "email", "phone_primary.phone", "address_primary.postal_code", "address_primary.city"],
                    limit: 10
                };
            } else {
                params = {
                    sort_name: { 'LIKE': `%${query}%` },
                    return: "id,display_name,email,phone,postal_code,city",
                    options: { limit: 10 }
                };
            }

            const data = await civiApi('Contact', 'get', params);
            const values = data.values || {};
            let results = Array.isArray(values) ? values : Object.values(values);

            // Normalize APIv4 fields
            if (apiVersion === '4') {
                results = results.map(c => ({
                    ...c,
                    phone: c['phone_primary.phone'],
                    postal_code: c['address_primary.postal_code'],
                    city: c['address_primary.city']
                }));
            }

            setResults(results);
        } catch (err) {
            alert(t('addParticipant.errorSearch'));
        } finally {
            setLoading(false);
        }
    };

    const registerContact = async (contactId) => {
        if (!window.confirm(t('addParticipant.confirmRegister'))) return;

        setLoading(true);
        try {
            const { apiVersion } = getSettings();

            if (apiVersion === '4') {
                await civiApi('Participant', 'create', {
                    values: {
                        contact_id: contactId,
                        event_id: eventId,
                        status_id: 1 // Registered
                    }
                });
            } else {
                await civiApi('Participant', 'create', {
                    contact_id: contactId,
                    event_id: eventId,
                    status_id: 1 // Registered
                });
            }

            alert(t('addParticipant.added'));
            navigate(`/event/${eventId}`);
        } catch (err) {
            alert(t('addParticipant.errorRegister', { error: err.message }));
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { apiVersion } = getSettings();
            let contactId;

            // 1. Create Contact
            if (apiVersion === '4') {
                // Prepare values
                const values = {
                    contact_type: "Individual",
                    first_name: newContact.first_name,
                    last_name: newContact.last_name,
                    email_primary: { email: newContact.email },
                };
                if (newContact.phone) {
                    values.phone_primary = { phone: newContact.phone, phone_type_id: "Mobile" };
                }

                const contactData = await civiApi('Contact', 'create', { values });

                // APIv4 returns array of created entities
                const resValues = contactData.values || [];
                if (resValues.length > 0) contactId = resValues[0].id;
                else throw new Error("Failed to create contact");

            } else {
                // APIv3
                const params = {
                    contact_type: "Individual",
                    first_name: newContact.first_name,
                    last_name: newContact.last_name,
                    email: newContact.email,
                };
                if (newContact.phone) {
                    params.phone = newContact.phone;
                    params.phone_type_id = 2; // Mobile usually
                }

                const contactData = await civiApi('Contact', 'create', params);
                if (contactData.is_error) throw new Error(contactData.error_message);
                contactId = contactData.id;
            }

            // 2. Register Participant
            if (apiVersion === '4') {
                await civiApi('Participant', 'create', {
                    values: {
                        contact_id: contactId,
                        event_id: eventId,
                        status_id: 1 // Registered
                    }
                });
            } else {
                await civiApi('Participant', 'create', {
                    contact_id: contactId,
                    event_id: eventId,
                    status_id: 1 // Registered
                });
            }

            alert(t('addParticipant.createdRegistered'));
            navigate(`/event/${eventId}`);
        } catch (err) {
            alert(t('addParticipant.errorCreate', { error: err.message }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-base-content">{t('addParticipant.title')}</h2>
            </div>

            <div role="tablist" className="tabs tabs-boxed mb-4">
                <a
                    role="tab"
                    className={`tab ${activeTab === 'search' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('search')}
                >
                    {t('addParticipant.searchTab')}
                </a>
                <a
                    role="tab"
                    className={`tab ${activeTab === 'create' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('create')}
                >
                    {t('addParticipant.createTab')}
                </a>
            </div>

            <div className="card bg-base-100 shadow-md border border-base-200">
                <div className="card-body p-4">
                    {activeTab === 'search' ? (
                        <div className="space-y-4">
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder={t('addParticipant.searchPlaceholder')}
                                    className="input input-bordered flex-grow"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                <button type="submit" className="btn btn-square btn-primary" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : <Search />}
                                </button>
                            </form>

                            <div className="space-y-2">
                                {results.map(contact => (
                                    <div key={contact.id} className="card bg-base-100 shadow-sm border border-base-200">
                                        <div className="card-body p-3 flex flex-row items-center justify-between">
                                            <div>
                                                <h3 className="font-bold">{contact.display_name}</h3>
                                                <p className="text-xs text-base-content/70">
                                                    {contact.email}
                                                    {contact.phone && ` • ${contact.phone}`}
                                                    {(contact.postal_code || contact.city) && ` • ${contact.postal_code || ''} ${contact.city || ''}`}
                                                </p>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-ghost text-primary"
                                                onClick={() => registerContact(contact.id)}
                                            >
                                                <UserPlus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {results.length === 0 && !loading && query && (
                                    <p className="text-center text-base-content/50">{t('addParticipant.noContacts')}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text font-medium">{t('addParticipant.firstName')}</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={newContact.first_name}
                                    onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text font-medium">{t('addParticipant.lastName')}</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={newContact.last_name}
                                    onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text font-medium">{t('addParticipant.email')}</span>
                                </label>
                                <input
                                    type="email"
                                    className="input input-bordered w-full"
                                    value={newContact.email}
                                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text font-medium">{t('addParticipant.mobilePhone')}</span>
                                </label>
                                <input
                                    type="tel"
                                    className="input input-bordered w-full"
                                    value={newContact.phone}
                                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                                />
                            </div>
                            <div className="pt-4">
                                <button type="submit" className="btn btn-primary w-full shadow-md" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : t('addParticipant.createRegister')}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AddParticipant;
