
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return showToast(message, 'info'); // fallback
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

document.addEventListener('DOMContentLoaded', function() {
    const { createClient } = window.supabase;
    const supabaseUrl = 'https://mnejfugdushmrwzocxlx.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZWpmdWdkdXNobXJ3em9jeGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5Mjg1ODMsImV4cCI6MjA3MzUwNDU4M30.XsAaOz53omvyBB9yPBLuTjmSYBrY4GBinqKbYPrup8w';
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { debug: true } });

    ['loginForm', 'registerForm'].forEach(formId => {
        const form = document.getElementById(formId);
        if (!form) {
            console.error(`Form with ID ${formId} not found`);
            return;
        }

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const button = this.querySelector('button[type="submit"]');
            if (!button) {
                console.error('Submit button not found');
                return;
            }
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
            button.disabled = true;

            const emailOrPhoneInput = this.querySelector('input[name="emailOrPhone"]');
            const passwordInput = this.querySelector('input[name="password"]');
            const stateSelect = this.querySelector('select[name="state"]');
            const departmentNameInput = formId === 'registerForm' ? this.querySelector('input[name="departmentName"]') : null;

            if (!emailOrPhoneInput || !passwordInput || !stateSelect || (formId === 'registerForm' && !departmentNameInput)) {
                showToast('Form fields are missing. Please check the form structure.', 'info');
                button.innerHTML = originalText;
                button.disabled = false;
                return;
            }

            const email = emailOrPhoneInput.value.trim();
            const password = passwordInput.value;
            const state = stateSelect.value;
            const departmentName = departmentNameInput ? departmentNameInput.value.trim() : null;

            if (!email || !password || !state || (formId === 'registerForm' && !departmentName)) {
                showToast('Please fill all required fields.', 'info');
                button.innerHTML = originalText;
                button.disabled = false;
                return;
            }

            try {
                if (formId === 'loginForm') {
                    console.log('Attempting login for email:', email);
                    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw new Error(`Login failed: ${error.message}`);
                    const { user } = data;

                    // Check user role
                    console.log('Fetching metadata for user ID:', user.id);
                    const { data: metadata, error: metadataError } = await supabase
                        .from('users_metadata')
                        .select('role, state, department_name')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (metadataError) {
                        console.error('Metadata fetch error:', metadataError);
                        throw new Error('Error fetching user role: ' + metadataError.message);
                    }

                    if (!metadata || metadata.role !== 'gov_portal') {
                        await supabase.auth.signOut();
                        throw new Error('This account is not authorized for the government portal.');
                    }

                    // Store user metadata for dashboard
                    localStorage.setItem('samudra_suraksha_user', JSON.stringify({
                        ...user,
                        state: metadata.state,
                        department_name: metadata.department_name,
                        role: metadata.role
                    }));

                    // Test dashboard accessibility
                    console.log('Checking accessibility of /samudradashboard.html');
                    const dashboardResponse = await fetch('/samudradashboard.html', { method: 'HEAD' });
                    if (!dashboardResponse.ok) {
                        console.error('Cannot access samudradashboard.html:', {
                            status: dashboardResponse.status,
                            statusText: dashboardResponse.statusText,
                            url: dashboardResponse.url
                        });
                        throw new Error('Dashboard page not found. Please contact support.');
                    }

                    showToast('Login successful! Redirecting to dashboard...', 'success');
                    window.location.href = '/dashboard';
                } else {
                    // Supabase Auth natively rejects duplicate emails — no pre-check needed
                    console.log('Attempting signup for email:', email, 'with metadata:', { role: 'gov_portal', state, department_name: departmentName });
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                role: 'gov_portal',
                                state,
                                department_name: departmentName
                            }
                        }
                    });

                    if (error) {
                        console.error('Signup error:', error);
                        throw new Error(`Signup failed: ${error.message}`);
                    }

                    const { user } = data;
                    if (user) {
                        console.log('User registered with ID:', user.id);

                        // Directly insert metadata row — works without a DB trigger
                        const { error: insertError } = await supabase
                            .from('users_metadata')
                            .upsert({
                                id: user.id,
                                role: 'gov_portal',
                                state,
                                department_name: departmentName
                            }, { onConflict: 'id' });

                        if (insertError) {
                            console.warn('Metadata insert warning (non-fatal):', insertError.message);
                            // Non-fatal: admin can set role manually in Supabase dashboard
                        }

                        showToast('Registration successful! Please check your email for verification, then log in.', 'success');
                        form.reset();
                    } else {
                        throw new Error('No user returned from signup.');
                    }
                }
            } catch (error) {
                console.error('Authentication error:', error.message);
                let errorMessage = error.message;
                if (error.message.includes('429')) {
                    errorMessage = 'Too many attempts. Please wait 30 seconds and try again.';
                } else if (error.message.includes('Email not confirmed')) {
                    errorMessage = 'Please verify your email before logging in.';
                }
                showToast(`Error: ${errorMessage}`, 'error');
            } finally {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        });
    });

    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.closest('.relative').querySelector('input[name="password"]');
            if (!input) {
                console.error('Password input not found');
                return;
            }
            input.type = input.type === 'password' ? 'text' : 'password';
            const icon = this.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
        });
    });
});