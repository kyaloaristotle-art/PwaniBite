// Google Identity Services setup shared by login and registration pages.
(async function initializeGoogleAuth() {
    const fallbackButton = document.getElementById('google-signin') || document.getElementById('google-signup');
    const buttonHost = document.getElementById('google-gis-button');
    const note = document.getElementById('social-auth-note') || document.getElementById('social-signup-note');
    const feedback = document.getElementById('login-feedback');
    if (!fallbackButton || !buttonHost || !note) return;

    const showMessage = (message) => {
        note.textContent = message;
        if (feedback) {
            feedback.textContent = message;
            feedback.hidden = false;
        }
    };

    const loadGoogleScript = () => new Promise((resolve, reject) => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
        document.head.appendChild(script);
    });

    let nonceBytes;
    try {
        nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    } catch (error) {
        showMessage('Google sign-in requires a secure site connection or localhost.');
        return;
    }
    const nonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join('');

    try {
        const config = await getGoogleAuthConfig();
        if (!config.configured || !config.client_id) {
            fallbackButton.addEventListener('click', () => {
                showMessage('Google sign-in needs a Web OAuth client ID. Follow the setup instructions in the backend Django README.');
            });
            return;
        }

        await loadGoogleScript();
        google.accounts.id.initialize({
            client_id: config.client_id,
            nonce,
            callback: async (credentialResponse) => {
                if (!credentialResponse.credential) {
                    showMessage('Google did not return a sign-in credential. Please try again.');
                    return;
                }
                const rememberMe = document.getElementById('remember-me');
                const shouldRemember = rememberMe ? rememberMe.checked : true;
                fallbackButton.disabled = true;
                showMessage('Signing you in with Google…');
                try {
                    const result = await googleSignIn(credentialResponse.credential, nonce, shouldRemember);
                    if (feedback) {
                        feedback.textContent = `Welcome, ${result.user.name}.`;
                        feedback.hidden = false;
                    }
                    window.location.href = getPostAuthRedirect();
                } catch (error) {
                    fallbackButton.disabled = false;
                    showMessage(error.message || 'Google sign-in failed. Please try again.');
                }
            }
        });
        google.accounts.id.renderButton(buttonHost, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: Math.min(400, Math.max(250, Math.floor(buttonHost.parentElement.getBoundingClientRect().width)))
        });
        fallbackButton.hidden = true;
        buttonHost.hidden = false;
        note.textContent = 'Sign in securely with your Google account.';
    } catch (error) {
        fallbackButton.addEventListener('click', () => showMessage(error.message || 'Google sign-in could not be initialized.'));
    }
})();
