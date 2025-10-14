document.addEventListener('DOMContentLoaded', () => {
    // ---- PARTE 1: REFERENCIAS A LOS ELEMENTOS DEL DOM ----
    const generateEmailBtn = document.getElementById('generate-email');
    const currentEmailSpan = document.getElementById('current-email');
    const copyEmailBtn = document.getElementById('copy-email');
    const refreshInboxBtn = document.getElementById('refresh-inbox');
    const inboxMessagesDiv = document.getElementById('inbox-messages');
    const savedEmailsList = document.getElementById('saved-emails-list');
    const modal = document.getElementById('email-modal');
    const closeModalBtn = document.getElementById('close-modal-btn'); 
    const modalSubject = document.getElementById('modal-subject');
    const modalFrom = document.getElementById('modal-from');
    const modalDate = document.getElementById('modal-date');
    const modalBody = document.getElementById('modal-body');
    const modalAttachments = document.getElementById('modal-attachments');
    const attachmentsList = document.getElementById('attachments-list');
    const attachmentsHr = document.getElementById('attachments-hr');

    // NUEVA REFERENCIA: Botón de eliminación masiva
    const deleteSelectedBtn = document.getElementById('delete-selected-emails');

    // ** REFERENCIAS DE AUDIO **
    const underwaterSound = document.getElementById('underwater-sound');
    const bubbleSound = document.getElementById('bubble-sound'); // Para borrar email individual
    const receiveSound = document.getElementById('receive-sound'); // Para recibir (actualizar)
    const copySound = document.getElementById('copy-sound'); // Para copiar
    const generateSound = document.getElementById('generate-sound'); // Para generar
    // NUEVA REFERENCIA
    const explosionSound = document.getElementById('explosion-sound'); // Para eliminar dirección


    // ---- PARTE 2: LÓGICA DE AUDIO ----
    const playSound = (audioElement) => {
        if (audioElement) {
            audioElement.currentTime = 0; 
            audioElement.volume = 0.3; // Volumen bajo para los sonidos de evento
            audioElement.play().catch(e => {}); 
        }
    };

    const startBackgroundAudio = () => {
        if (underwaterSound) {
            underwaterSound.volume = 0.15; // Volumen muy bajo para el fondo
            underwaterSound.play().catch(e => {}); 
        }
    };

    // Intentamos iniciar el audio de fondo después de la primera interacción del usuario
    document.body.addEventListener('click', startBackgroundAudio, { once: true });


    // ---- PARTE 3: VARIABLES Y LÓGICA DE LA APP ----
    let currentAccount = null;
    let savedEmails = JSON.parse(localStorage.getItem('savedEmails')) || [];
    let API_URL = 'https://api.mail.tm';
    (async () => {
        try {
            const res = await fetch('https://api.mail.gw/domains');
            if (!res.ok) throw new Error();
            console.log("✅ Servidor mail.gw disponible.");
        } catch {
            console.warn("⚠️ mail.gw no disponible, usando mail.tm");
            API_URL = 'https://api.mail.tm';
        }
    })();

    const getSecureAttachmentUrl = async (attachmentId) => {
        if (!currentAccount || !currentAccount.token) return { error: true };
        if (/^ATTACH\d+$/i.test(attachmentId)) {
            console.warn("Adjunto inválido o inexistente:", attachmentId);
            return { error: true, fake: true };
        }
        try {
            const response = await fetch(`${API_URL}/attachments/${attachmentId}`, {
                headers: { 'Authorization': `Bearer ${currentAccount.token}` }
            });
            if (!response.ok) return { error: true };
            const blob = await response.blob();
            return { url: URL.createObjectURL(blob), error: false };
        } catch (error) {
            console.error("Error obteniendo la URL segura del adjunto:", error);
            return { error: true };
        }
    };

    const openEmail = async (messageId) => {
        attachmentsList.innerHTML = '';
        modalAttachments.classList.add('hidden');
        attachmentsHr.classList.add('hidden');
        modalBody.innerHTML = "<p>Cargando contenido...</p>";
        
        modal.classList.add('show');
        const modalContent = document.querySelector('#email-modal .modal-content');
        if (modalContent) {
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateY(0) scale(1)';
        }

        try {
            const response = await fetch(`${API_URL}/messages/${messageId}`, {
                headers: { 'Authorization': `Bearer ${currentAccount.token}` }
            });
            if (!response.ok) throw new Error('No se pudo abrir el email.');
            const messageDetails = await response.json();

            modalSubject.textContent = messageDetails.subject;
            modalFrom.textContent = messageDetails.from.address;
            modalDate.textContent = new Date(messageDetails.createdAt).toLocaleString();

            let htmlContent = (messageDetails.html && messageDetails.html.length > 0)
                ? messageDetails.html[0]
                : `<p>${messageDetails.text || ''}</p>`;

            const attachments = messageDetails.attachments;
            let hasVisibleAttachments = false;

            if (attachments && attachments.length > 0) {
                await Promise.all(attachments.map(async (file) => {
                    const result = await getSecureAttachmentUrl(file.id);
                    if (result.fake) {
                        const fakeItem = document.createElement('div');
                        fakeItem.classList.add('attachment-item');
                        fakeItem.innerHTML = `<span>📁 ${file.filename} — no disponible (servidor antiguo)</span>`;
                        attachmentsList.appendChild(fakeItem);
                        hasVisibleAttachments = true;
                        return;
                    }
                    if (result.error) {
                        const errorItem = document.createElement('div');
                        errorItem.classList.add('attachment-item');
                        errorItem.innerHTML = `<span>Error al cargar: ${file.filename}</span>`;
                        attachmentsList.appendChild(errorItem);
                        hasVisibleAttachments = true;
                        return;
                    }

                    // Si el archivo se obtuvo correctamente
                    const secureUrl = result.url;
                    hasVisibleAttachments = true;

                    // Reemplazar “cid:” o “attachment:” en el HTML
                    if (file.contentId) {
                        const cidRegex = new RegExp(
                            `(cid:|attachment:)${file.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
                            "g"
                        );
                        htmlContent = htmlContent.replace(cidRegex, secureUrl);
                    }

                    const attachmentItem = document.createElement('div');
                    attachmentItem.classList.add('attachment-item');
                    const fileName = document.createElement('span');
                    fileName.textContent = `${file.filename} (${(file.size / 1024).toFixed(2)} KB)`;
                    const downloadLink = document.createElement('a');
                    downloadLink.href = secureUrl;
                    downloadLink.textContent = 'Descargar';
                    downloadLink.download = file.filename;
                    attachmentItem.appendChild(fileName);
                    attachmentItem.appendChild(downloadLink);
                    attachmentsList.appendChild(attachmentItem);
                }));

                if (hasVisibleAttachments) {
                    modalAttachments.classList.remove('hidden');
                    attachmentsHr.classList.remove('hidden');
                }
            }

            modalBody.innerHTML = htmlContent;

        } catch (error) {
            console.error('Error al abrir el email:', error);
            modalBody.innerHTML = "<p>No se pudo cargar el contenido del email.</p>";
        }
    };

    // FUNCIÓN DE ELIMINACIÓN DE DIRECCIÓN DE EMAIL
    const deleteEmailAddress = (address) => {
        const accountToDelete = savedEmails.find(acc => acc.address === address);
        if (!accountToDelete) return;
        const visibleMessages = accountToDelete.messages.filter(msg => !(accountToDelete.deletedIds || []).includes(msg.id));
        if (visibleMessages.length > 0) {
            if (confirm("¿Querés descargar todos los emails de esta dirección en un archivo ZIP antes de borrarla para siempre?")) {
                downloadEmailsAsZip(accountToDelete).then(() => { proceedWithDeletion(address); });
                return;
            }
        }
        if (confirm("ADVERTENCIA: La dirección y todos sus emails se borrarán permanentemente. ¿Continuar?")) {
            proceedWithDeletion(address);
        }
    };

    // FUNCIÓN DE ELIMINACIÓN MASIVA
    const deleteSelectedEmails = () => {
        if (!currentAccount) return;
        
        const checkedBoxes = inboxMessagesDiv.querySelectorAll('.email-item-selector input[type="checkbox"]:checked');
        
        if (checkedBoxes.length === 0) {
            alert("No seleccionaste ningún correo para eliminar.");
            return;
        }

        if (!confirm(`¿Estás seguro de que querés borrar ${checkedBoxes.length} correos seleccionados para siempre?`)) {
            return;
        }

        const accountInStorage = savedEmails.find(acc => acc.address === currentAccount.address);
        if (!accountInStorage.deletedIds) { accountInStorage.deletedIds = []; }
        
        checkedBoxes.forEach(checkbox => {
            const messageId = checkbox.closest('.email-item').querySelector('.email-item-content').dataset.id;
            accountInStorage.deletedIds.push(messageId);
            
            const emailItemElement = checkbox.closest('.email-item');
            emailItemElement.classList.add('deleting');
        });

        playSound(bubbleSound); // Suena una sola vez para la eliminación masiva

        setTimeout(() => {
            localStorage.setItem('savedEmails', JSON.stringify(savedEmails));
            displayMessages(accountInStorage);
        }, 300); // 300ms de la animación
    };

    // FUNCIÓN DE ELIMINACIÓN INDIVIDUAL
    const deleteSingleEmail = (messageId) => {
        if (!currentAccount) return;
        if (confirm("¿Estás seguro de que querés borrar este email para siempre?")) {
            const accountInStorage = savedEmails.find(acc => acc.address === currentAccount.address);
            if (!accountInStorage.deletedIds) { accountInStorage.deletedIds = []; }
            accountInStorage.deletedIds.push(messageId);
            
            const emailItemElement = inboxMessagesDiv.querySelector(`.email-item-content[data-id="${messageId}"]`).closest('.email-item');
            emailItemElement.classList.add('deleting');

            playSound(bubbleSound); // SUENA BURBUJA AL BORRAR

            setTimeout(() => {
                localStorage.setItem('savedEmails', JSON.stringify(savedEmails));
                displayMessages(accountInStorage);
            }, 300); 
        }
    };

    const displayMessages = (account) => {
        inboxMessagesDiv.innerHTML = '';
        const visibleMessages = account.messages.filter(msg => !(account.deletedIds || []).includes(msg.id));
        if (visibleMessages.length === 0) {
            inboxMessagesDiv.innerHTML = '<p>No hay mensajes en esta bandeja.</p>';
            return;
        }
        visibleMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        visibleMessages.forEach((message, index) => {
            const emailDiv = document.createElement('div');
            emailDiv.classList.add('email-item');
            
            emailDiv.classList.add('visible'); 
            
            // --- AÑADIR CHECKBOX ---
            const selectorDiv = document.createElement('div');
            selectorDiv.classList.add('email-item-selector');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            selectorDiv.appendChild(checkbox);
            emailDiv.appendChild(selectorDiv);
            // --------------------

            const contentDiv = document.createElement('div');
            contentDiv.classList.add('email-item-content');
            contentDiv.dataset.id = message.id;
            contentDiv.innerHTML = `<p class="from">${message.from.address}</p><p class="subject">${message.subject}</p><p class="date">${new Date(message.createdAt).toLocaleString()}</p>`;
            
            const deleteSpan = document.createElement('span');
            deleteSpan.classList.add('delete-icon');
            deleteSpan.innerHTML = '🗑️';
            deleteSpan.title = 'Borrar este email';
            
            // Importante: detener la propagación del clic para que no abra el email
            deleteSpan.addEventListener('click', (e) => { e.stopPropagation(); deleteSingleEmail(message.id); });
            
            emailDiv.appendChild(contentDiv);
            emailDiv.appendChild(deleteSpan);
            inboxMessagesDiv.appendChild(emailDiv);
        });
    };

    const fetchInbox = async () => {
        if (!currentAccount || !currentAccount.token) return;
        
        try {
            const response = await fetch(`${API_URL}/messages`, { headers: { 'Authorization': `Bearer ${currentAccount.token}` } });
            if (!response.ok) throw new Error('No se pudo obtener la bandeja de entrada.');
            const newMessages = await response.json();
            const messageList = newMessages['hydra:member'];
            const accountInStorage = savedEmails.find(acc => acc.address === currentAccount.address);
            let newMessagesFound = false;
            
            messageList.forEach(newMessage => {
                const isAlreadySaved = accountInStorage.messages.some(savedMsg => savedMsg.id === newMessage.id);
                const isDeleted = (accountInStorage.deletedIds || []).includes(newMessage.id);
                if (!isAlreadySaved && !isDeleted) {
                    accountInStorage.messages.push(newMessage);
                    newMessagesFound = true;
                }
            });
            
            if (newMessagesFound) { 
                localStorage.setItem('savedEmails', JSON.stringify(savedEmails)); 
                playSound(receiveSound); // SUENA AL RECIBIR
            }
            
            displayMessages(accountInStorage);
        } catch (error) {
            console.error('Error al obtener la bandeja de entrada:', error);
            inboxMessagesDiv.innerHTML = '<p>Error al cargar los mensajes. Mostrando los guardados.</p>';
        }
    };

    // FUNCIÓN DE RENDERIZADO DE DIRECCIONES GUARDADAS
    const renderSavedEmails = () => {
        savedEmailsList.innerHTML = '';
        savedEmails.forEach(account => {
            const li = document.createElement('li');
            li.classList.add('saved-email-item');
            
            const addressContent = document.createElement('span');
            addressContent.textContent = account.address;
            addressContent.style.flexGrow = 1;
            addressContent.style.cursor = 'pointer'; 

            addressContent.addEventListener('click', () => {
                currentAccount = account;
                currentEmailSpan.textContent = account.address;
                copyEmailBtn.classList.remove('hidden');
                displayMessages(account);
                fetchInbox();
            });
            
            const deleteSpan = document.createElement('span');
            deleteSpan.classList.add('delete-icon'); 
            deleteSpan.innerHTML = '🗑️';
            deleteSpan.title = 'Borrar esta dirección y sus emails';
            
            // Listener CORREGIDO para eliminar la dirección
            deleteSpan.addEventListener('click', (e) => { 
                e.stopPropagation(); // Detiene la propagación para que NO se active addressContent
                deleteEmailAddress(account.address); 
            });
            
            li.appendChild(addressContent);
            li.appendChild(deleteSpan);
            savedEmailsList.appendChild(li);
        });
    };

    const randomString = (length = 10) => Math.random().toString(36).substring(2, 2 + length);

    const downloadEmailsAsZip = async (account) => {
        const visibleMessages = account.messages.filter(msg => !(account.deletedIds || []).includes(msg.id));
        if (visibleMessages.length === 0) { alert("No hay emails visibles para descargar."); return; }
        const zip = new JSZip();
        for (const message of visibleMessages) {
            const folderName = `${message.id}_${message.subject.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`;
            const folder = zip.folder(folderName);
            let bodyContent = message.text || "Cuerpo del email no disponible.";
            if (message.html && message.html.length > 0) { bodyContent = message.html[0]; }
            const emailContent = `De: ${message.from.address}\nFecha: ${new Date(message.createdAt).toLocaleString()}\nAsunto: ${message.subject}\n\n--- CUERPO DEL EMAIL ---\n\n`;
            folder.file("cuerpo.html", bodyContent);
            folder.file("info.txt", emailContent);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipBlob);
        link.download = `${account.address}_emails.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const proceedWithDeletion = (address) => {
        
        // SUENA EXPLOSIÓN ANTES DE LA ELIMINACIÓN VISUAL
        playSound(explosionSound);
        
        // Animación de desintegración si quieres
        // const itemElement = document.querySelector(`.saved-email-item span:first-child[textContent='${address}']`).closest('.saved-email-item');
        // if (itemElement) itemElement.classList.add('deleting-address');

        // Delay para la animación (si la tuvieras)
        // setTimeout(() => {
            savedEmails = savedEmails.filter(acc => acc.address !== address);
            localStorage.setItem('savedEmails', JSON.stringify(savedEmails));
            if (currentAccount && currentAccount.address === address) {
                currentAccount = null;
                currentEmailSpan.textContent = "Seleccioná o generá un email.";
                copyEmailBtn.classList.add('hidden');
                inboxMessagesDiv.innerHTML = '';
            }
            renderSavedEmails();
        // }, 300);
    };

    const generateNewEmail = async () => {
        
        playSound(generateSound); // SUENA AL GENERAR

        try {
            const domainResponse = await fetch(`${API_URL}/domains`);
            if (!domainResponse.ok) throw new Error('No se pudieron obtener los dominios.');
            const domains = await domainResponse.json();
            const domainList = domains['hydra:member'].map(d => d.domain);
            const domain = domainList[Math.floor(Math.random() * domainList.length)];
            console.log("🌀 Dominio elegido:", domain);
            const address = `${randomString()}@${domain}`;
            const password = randomString(12);

            const createAccountResponse = await fetch(`${API_URL}/accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, password })
            });
            if (!createAccountResponse.ok) throw new Error('No se pudo crear la cuenta.');
            const newAccountData = await createAccountResponse.json();

            const tokenResponse = await fetch(`${API_URL}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, password })
            });
            if (!tokenResponse.ok) throw new Error('No se pudo obtener el token.');
            const tokenData = await tokenResponse.json();

            currentAccount = { address, token: tokenData.token, messages: [], deletedIds: [] };
            currentEmailSpan.textContent = address;
            copyEmailBtn.classList.remove('hidden');

            if (!savedEmails.find(acc => acc.address === address)) {
                savedEmails.push({ ...currentAccount, id: newAccountData.id });
                localStorage.setItem('savedEmails', JSON.stringify(savedEmails));
                renderSavedEmails();
            }

            displayMessages(currentAccount);
        } catch (error) {
            console.error('Error al generar el email:', error);
            currentEmailSpan.textContent = 'Error al generar. Intenta de nuevo.';
        }
    };

    // ---- PARTE 4: EVENT LISTENERS ----
    generateEmailBtn.addEventListener('click', generateNewEmail);
    copyEmailBtn.addEventListener('click', () => {
        if (currentAccount) {
            navigator.clipboard.writeText(currentAccount.address).then(() => alert('Email copiado'));
            playSound(copySound); // SUENA AL COPIAR
        }
    });
    refreshInboxBtn.addEventListener('click', fetchInbox);
    
    deleteSelectedBtn.addEventListener('click', deleteSelectedEmails);
    
    inboxMessagesDiv.addEventListener('click', (e) => {
        const contentItem = e.target.closest('.email-item-content');
        if (contentItem) { openEmail(contentItem.dataset.id); }
    });
    
    closeModalBtn.addEventListener('click', () => modal.classList.remove('show')); 
    
    window.addEventListener('click', (e) => { if (e.target == modal) modal.classList.remove('show'); });

    renderSavedEmails();
});