import re
import os

states = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", 
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
]
opts_auth = '\n'.join([f'                                            <option value="{s}">{s}</option>' for s in states])
opts_dash = '\n'.join([f'                                    <option value="{s}">{s}</option>' for s in states])

# Fix auth.html
with open('auth.html', 'r') as f:
    html = f.read()
html = re.sub(
    r'<select class="form-control" name="state" required>.*?<\/select>',
    f'<select class="form-control" name="state" required>\n                                            <option value="">Select your state</option>\n{opts_auth}\n                                        </select>',
    html, flags=re.DOTALL
)
with open('auth.html', 'w') as f:
    f.write(html)

# Fix samudradashboard.html profile region
with open('samudradashboard.html', 'r') as f:
    html = f.read()
html = re.sub(
    r'<select id="profileRegion".*?>.*?<\/select>',
    f'<select id="profileRegion" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-accent focus:border-transparent">\n{opts_dash}\n                                </select>',
    html, flags=re.DOTALL
)

# Add showToast CSS and HTML if missing
if 'toast-container' not in html:
    toast_css_html = """
    <style>
        .toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
        .toast { padding: 12px 20px; border-radius: 8px; color: white; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); display: flex; align-items: center; gap: 8px; }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.success { background: #10B981; }
        .toast.error { background: #EF4444; }
        .toast.info { background: #3B82F6; }
    </style>
    <div id="toast-container" class="toast-container"></div>
    """
    html = html.replace('</body>', toast_css_html + '\n</body>')
with open('samudradashboard.html', 'w') as f:
    f.write(html)

def fix_alerts(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Add showToast function if missing
    if 'function showToast' not in content:
        toast_fn = """
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return alert(message); // fallback
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
"""
        content = toast_fn + "\n" + content
    
    # Replace alert(...)
    def alert_repl(m):
        msg = m.group(1)
        type_str = "'error'" if 'Failed' in msg or 'Error' in msg or 'error' in msg else "'success'" if 'success' in msg.lower() else "'info'"
        return f"showToast({msg}, {type_str})"
        
    content = re.sub(r'alert\((.*?)\)', alert_repl, content)
    with open(filepath, 'w') as f:
        f.write(content)

fix_alerts('dashboard33.js')
fix_alerts('auth.js')
fix_alerts('coastalinfo.js')

print("Fixes applied.")
