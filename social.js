document.addEventListener('DOMContentLoaded', () => {
    console.log('social.js: Script loaded at', new Date().toISOString());

    const socialTab = document.getElementById('social-tab');
    if (!socialTab) {
        console.error('social.js: Social tab with id="social-tab" not found');
        return;
    }

    const searchInput = document.getElementById('twitter-search');
    const searchButton = document.getElementById('twitter-search-btn');
    const tweetsContainer = document.getElementById('tweets-container');
    const loadingSpinner = document.getElementById('twitter-loading');
    const hazardFilter = document.getElementById('hazardFilter');
    const sentimentFilter = document.getElementById('sentimentFilter');
    const regionFilter = document.getElementById('regionFilter');
    const urgencyFilter = document.getElementById('urgencyFilter');
    const refreshButton = document.getElementById('refreshTweets');
    const socialMapContainer = document.getElementById('social-map');
    const tweetVolumeChartCanvas = document.getElementById('tweetVolumeChart');
    const sentimentChartCanvas = document.getElementById('sentimentChart');
    const hazardDistributionChartCanvas = document.getElementById('hazardDistributionChart');
    const trendingKeywordsContainer = document.getElementById('trendingKeywords');

    let dateFilter = document.getElementById('dateFilter');
    if (!dateFilter) {
        dateFilter = document.createElement('select');
        dateFilter.id = 'dateFilter';
        dateFilter.className = 'px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-accent focus:border-transparent font-sans text-sm font-medium';
        dateFilter.innerHTML = `
            <option value="all">All Time</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
        `;
        searchInput.parentElement.appendChild(dateFilter);
    }
    let sourceFilter = document.getElementById('sourceFilter');
    if (!sourceFilter) {
        sourceFilter = document.createElement('select');
        sourceFilter.id = 'sourceFilter';
        sourceFilter.className = 'px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-accent focus:border-transparent font-sans text-sm font-medium';
        sourceFilter.innerHTML = `
            <option value="all">All Sources</option>
            <option value="twitter">Twitter</option>
            <option value="news">News & RSS</option>
        `;
        searchInput.parentElement.appendChild(sourceFilter);
    }

    console.log('social.js: DOM Elements:', {
        socialTab: !!socialTab,
        searchInput: !!searchInput,
        searchButton: !!searchButton,
        tweetsContainer: !!tweetsContainer,
        loadingSpinner: !!loadingSpinner,
        hazardFilter: !!hazardFilter,
        sentimentFilter: !!sentimentFilter,
        regionFilter: !!regionFilter,
        urgencyFilter: !!urgencyFilter,
        dateFilter: !!dateFilter,
        sourceFilter: !!sourceFilter,
        refreshButton: !!refreshButton,
        socialMapContainer: !!socialMapContainer,
        tweetVolumeChartCanvas: !!tweetVolumeChartCanvas,
        sentimentChartCanvas: !!sentimentChartCanvas,
        hazardDistributionChartCanvas: !!hazardDistributionChartCanvas,
        trendingKeywordsContainer: !!trendingKeywordsContainer
    });

    if (!searchInput || !searchButton || !tweetsContainer || !loadingSpinner || !hazardFilter || !sentimentFilter || !regionFilter || !urgencyFilter || !dateFilter || !sourceFilter || !refreshButton || !socialMapContainer || !tweetVolumeChartCanvas || !sentimentChartCanvas || !hazardDistributionChartCanvas || !trendingKeywordsContainer) {
        console.error('social.js: Missing required DOM elements');
        if (tweetsContainer) tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">Error: Required elements not found</p>';
        return;
    }

    const socialMap = L.map('social-map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(socialMap);
    const markers = L.markerClusterGroup();
    socialMap.addLayer(markers);

    const chartOptionsBase = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { size: 11 } } } }
    };

    const tweetVolumeChart = new Chart(tweetVolumeChartCanvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Posts',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.4, fill: true, pointRadius: 3
            }]
        },
        options: {
            ...chartOptionsBase,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const categoryChart = new Chart(sentimentChartCanvas, {
        type: 'doughnut',
        data: {
            labels: ['Emergency', 'Neutral', 'Panic/Fear', 'Official', 'Other'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: ['#ef4444','#3b82f6','#f59e0b','#10b981','#6b7280']
            }]
        },
        options: {
            ...chartOptionsBase,
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
    });

    const hazardDistributionChart = new Chart(hazardDistributionChartCanvas, {
        type: 'bar',
        data: {
            labels: ['Flood', 'Tsunami', 'Waves', 'Erosion', 'Storm', 'Other'],
            datasets: [{
                label: 'Count',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: ['#3b82f6','#8b5cf6','#06b6d4','#f59e0b','#ef4444','#6b7280']
            }]
        },
        options: {
            ...chartOptionsBase,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    function resizeSocialCharts() {
        [tweetVolumeChart, categoryChart, hazardDistributionChart].forEach(ch => {
            if (ch) ch.resize();
        });
    }

    const observer = new MutationObserver(() => {
        if (!socialTab.classList.contains('hidden')) {
            setTimeout(() => {
                socialMap.invalidateSize();
                resizeSocialCharts();
                console.log('social.js: Invalidated map size on tab visibility change');
            }, 150);
        }
    });
    observer.observe(socialTab, { attributes: true, attributeFilter: ['class'] });

    setTimeout(() => socialMap.invalidateSize(), 100);

    const indianLocations = {
        'ANDAMAN AND NICOBAR ISLANDS': [11.7401, 92.6586],
        'ANDHRA PRADESH': [15.9129, 79.7400],
        'ARUNACHAL PRADESH': [28.2180, 94.7278],
        'ASSAM': [26.2006, 92.9378],
        'BIHAR': [25.0941, 85.3136],
        'CHHATTISGARH': [21.2514, 81.6299],
        'GOA': [15.2993, 74.1240],
        'GUJARAT': [22.2587, 71.1924],
        'HARYANA': [29.0588, 77.1984],
        'HIMACHAL PRADESH': [31.1048, 77.1734],
        'JAMMU AND KASHMIR': [33.7782, 76.5762],
        'JHARKHAND': [23.3441, 85.3096],
        'KARNATAKA': [15.3173, 75.7139],
        'KERALA': [10.8505, 76.2711],
        'MADHYA PRADESH': [22.9734, 78.6569],
        'MAHARASHTRA': [19.7515, 75.7139],
        'MANIPUR': [24.6638, 93.9063],
        'MEGHALAYA': [25.4670, 91.3662],
        'MIZORAM': [23.1645, 92.9378],
        'NAGALAND': [25.4670, 94.1230],
        'ODISHA': [20.9517, 85.0985],
        'PUNJAB': [30.7333, 76.7794],
        'RAJASTHAN': [27.0238, 74.2179],
        'SIKKIM': [27.5330, 88.5122],
        'TAMIL NADU': [11.1271, 78.6569],
        'TELANGANA': [17.3850, 78.4867],
        'TRIPURA': [23.9408, 91.9882],
        'UTTAR PRADESH': [26.8467, 80.9462],
        'UTTARAKHAND': [30.3165, 78.0322],
        'WEST BENGAL': [22.9868, 87.8550],
        'CHANDIGARH': [30.7333, 76.7794],
        'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': [20.4283, 72.8397],
        'DELHI': [28.7041, 77.1025],
        'LADAKH': [34.1526, 77.5770],
        'LAKSHADWEEP': [10.5667, 72.6417],
        'PUDUCHERRY': [11.9416, 79.8083],
        'MUMBAI': [19.0760, 72.8777],
        'CHENNAI': [13.0827, 80.2707],
        'KOLKATA': [22.5726, 88.3639],
        'SURAT': [21.1702, 72.8311],
        'VISAKHAPATNAM': [17.6868, 83.2185],
        'KOCHI': [9.9312, 76.2673],
        'PONDICHERRY': [11.9416, 79.8083],
        'MANGALORE': [12.9141, 74.8560],
        'VARKALA': [8.7333, 76.7167],
        'MARARI BEACH': [9.4833, 76.3167],
        'MUNNAR': [10.0892, 77.0596],
        'ALAPPUZHA': [9.4981, 76.3388],
        'KOLLAM': [8.8934, 76.6102],
        'THRISSUR': [10.5276, 76.2144],
        'KANNUR': [11.8743, 75.3707],
        'KASARGOD': [12.4981, 75.0102],
        'BHOPAL': [23.2599, 77.4126],
        'HYDERABAD': [17.3850, 78.4867],
        'AHMEDABAD': [23.0225, 72.5714],
        'PATNA': [25.5941, 85.1376],
        'LUCKNOW': [26.8467, 80.9462],
        'SUNDARBANS': [22.0000, 88.8000],
        'PARADI PADA VILLAGE': [21.1702, 72.8311],
        'DHARALI VILLAGE': [30.7333, 78.4667],
        'KHEER GANGA': [31.0000, 79.0000],
        'GODAVARI DELTA': [16.7667, 81.8000],
        'MAHANADI DELTA': [20.4667, 86.6667],
        'KRISHNA DELTA': [16.0000, 81.0000],
        'KOSHI RIVER': [26.0000, 86.0000],
        'TEESTA RIVER': [27.0000, 88.5000],
        'DAMODAR RIVER': [23.5000, 87.5000],
        'SABARMATI RIVER': [23.0000, 72.5000],
        'PENNAR RIVER': [14.0000, 79.0000],
        'VAIGAI RIVER': [10.0000, 78.0000],
        'KAVERI DELTA': [11.0000, 79.0000],
        'COLERON LAKE': [16.7167, 81.2167],
        'GOMTI RIVER': [26.8467, 80.9462],
        'YAMUNA RIVER': [28.7041, 77.1025],
        'GOMTI FLOOD PLAIN': [26.8467, 80.9462]
    };

    // ✅ SECURITY: Gemini API key is now on the backend.
    //    Client calls /api/analyze-tweets — key never exposed in browser.

    let tweetsData = [];
    let tweetVolumeData = [];
    let lastSearchTime = Date.now();

    function isOnline() {
        return navigator.onLine;
    }

    async function fetchWithRetry(url, options, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    const data = await response.json();
                    return data.candidates[0].content.parts[0].text;
                }
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Invalid API key or quota exceeded. Get a new key at https://makersuite.google.com/app/apikey');
                }
                if (response.status === 404) {
                    throw new Error('Gemini model not found. Check model name or API version');
                }
                throw new Error(`API error: ${response.statusText} (${response.status})`);
            } catch (error) {
                console.warn(`social.js: Gemini attempt ${i + 1} failed: ${error.message}`);
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    async function searchTwitter(query = '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ്കാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml', max_results = 20) {
        console.log('social.js: Searching Twitter with query:', query, 'max_results:', max_results);
        loadingSpinner.classList.remove('hidden');
        tweetsContainer.innerHTML = '';
        markers.clearLayers();

        try {
            const response = await fetch('/api/twitter/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, max_results })
            });
            const data = await response.json();
            console.log('social.js: Search API Response:', data);

            if (data.error || !data.jobUUID) {
                console.error('social.js: Search Error:', data.error || 'No jobUUID');
                tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${data.error || 'No job UUID'}</p>`;
                loadingSpinner.classList.add('hidden');
                return;
            }

            const jobUUID = data.jobUUID;
            let attempts = 0;
            const maxAttempts = 10;

            const pollResults = async () => {
                if (attempts >= maxAttempts) {
                    console.error('social.js: Max polling attempts reached');
                    tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">Timeout: No results after 10 attempts</p>';
                    loadingSpinner.classList.add('hidden');
                    return;
                }

                attempts++;
                console.log('social.js: Polling attempt', attempts, 'for jobUUID:', jobUUID);

                try {
                    const resultResponse = await fetch(`/api/twitter/result/${jobUUID}`);
                    const resultData = await resultResponse.json();
                    console.log('social.js: Result API Response:', resultData);

                    if (resultData.error) {
                        console.error('social.js: Result Error:', resultData.error);
                        tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${resultData.error}</p>`;
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    // New backend returns {status, results, count}
                    if (resultData.status === 'pending') {
                        setTimeout(pollResults, 2000);
                        return;
                    }

                    const tweets = resultData.results || [];
                    if (resultData.status === 'done' && tweets.length > 0) {
                        tweetsData = [];
                        await processTweetsWithGemini(tweets);
                        updateTweetVolume();
                        applyFilters();
                        updateAnalytics();
                        updateMap(tweetsData);
                        resizeSocialCharts();
                        loadingSpinner.classList.add('hidden');
                        return;
                    } else if (resultData.status === 'done' && tweets.length === 0) {
                        tweetsContainer.innerHTML = '<p class="text-gray-500 font-sans text-sm p-4">No relevant coastal hazard news found for this query. Try a broader search term.</p>';
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    setTimeout(pollResults, 2000 * attempts);
                } catch (error) {
                    console.error('social.js: Polling Error:', error.message);
                    if (attempts < maxAttempts) {
                        setTimeout(pollResults, 2000);
                    } else {
                        tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${error.message}</p>`;
                        loadingSpinner.classList.add('hidden');
                    }
                }
            };

            setTimeout(pollResults, 2000);
        } catch (error) {
            console.error('social.js: Search Request Error:', error.message);
            tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${error.message}</p>`;
            loadingSpinner.classList.add('hidden');
        }
    }


    /**
     * Normalizes the RSS backend response to the format social.js expects,
     * then displays directly. Backend already ran Gemini — no re-analysis needed.
     */
    async function processTweetsWithGemini(rawTweets) {
        tweetsContainer.innerHTML = '';
        let processedTweets = [];

        for (const t of rawTweets) {
            if ((t.source || '').toLowerCase() === 'reddit') continue;
            // ── Normalize field names from RSS backend ──────────────────
            const hazard   = t.hazard_type || t.hazard || detectHazard(t.content || '');
            const urgency  = t.urgency  || determineUrgency(t.category || '', hazard);
            const locRegion = (t.location_region || t.location?.region || 'Unknown').toUpperCase();
            const coords = (t.lat && t.lng)
                ? [parseFloat(t.lat), parseFloat(t.lng)]
                : (indianLocations[locRegion] || [20.5937, 78.9629]);

            const normalized = {
                ...t,
                id: t.id || `post-${processedTweets.length}`,
                hazard,
                urgency,
                relevance_score: t.relevance_score,
                category:     t.category     || 'Observation/Neutral Report',
                confidence:   t.confidence   || 0.75,
                misinfo_flag: t.misinfo_flag  || false,
                misinfo_reason: t.misinfo_reason || '',
                hashtags:     Array.isArray(t.hashtags) ? t.hashtags : [],
                sentiment:    t.sentiment    || 'neutral',
                url:          t.url          || '',
                location: {
                    region: locRegion,
                    coordinates: coords
                },
                // Keep legacy metadata shape for card renderer
                metadata: {
                    username:   t.username || t.metadata?.username || 'News Source',
                    created_at: t.created_at || t.metadata?.created_at || new Date().toISOString(),
                    public_metrics: {
                        retweet_count: t.retweet_count || 0,
                        like_count:    t.like_count    || 0,
                        reply_count:   t.reply_count   || 0
                    }
                }
            };

            if (!normalized.id) normalized.id = `post-${processedTweets.length}-${Date.now()}`;
            processedTweets.push(normalized);
        }

        tweetsData = sortByRecency(processedTweets);
        displayTweets(tweetsData);
        console.log(`social.js: Displayed ${processedTweets.length} normalized posts (already Gemini-analyzed by backend)`);
        return processedTweets;
    }

    /** Show a spike alert banner in the UI */
    function showSpikeAlert(spike) {
        const banner = document.createElement('div');
        banner.className = 'bg-red-50 border border-red-400 text-red-800 px-4 py-3 rounded-lg mb-3 flex items-start space-x-3';
        banner.innerHTML = `
            <span class="text-xl">🚨</span>
            <div>
                <p class="font-bold text-sm">Spike Detected: ${spike.hazard.toUpperCase()} in ${spike.region}</p>
                <p class="text-xs">${spike.message}</p>
                <p class="text-xs text-gray-500 mt-1">A draft alert has been queued in the Alerts tab for review.</p>
            </div>
            <button onclick="this.parentElement.remove()" class="ml-auto text-red-400 hover:text-red-600 text-lg font-bold">&times;</button>
        `;
        tweetsContainer.insertBefore(banner, tweetsContainer.firstChild);
    }

    /** Persist analyzed tweets to Supabase social_intelligence table (fire-and-forget) */
    async function persistTweetsToSupabase(tweets) {
        try {
            // Use the global supabaseClient from dashboard33.js (shared scope)
            if (typeof supabaseClient === 'undefined') return;

            const rows = tweets.map(t => ({
                source:          'twitter',
                tweet_id:        t.metadata?.id || null,
                content:         t.content || '',
                username:        t.metadata?.username || null,
                hazard_type:     t.hazard || 'other',
                category:        t.category || 'Observation/Neutral Report',
                urgency:         t.urgency || 'low',
                confidence:      t.confidence || 0.5,
                location_region: t.location?.region || 'Unknown',
                lat:             t.location?.coordinates?.[0] || null,
                lng:             t.location?.coordinates?.[1] || null,
                hashtags:        JSON.stringify(t.hashtags || []),
                misinfo_flag:    t.misinfo_flag || false,
                misinfo_reason:  t.misinfo_reason || '',
                retweet_count:   t.metadata?.public_metrics?.retweet_count || 0,
                like_count:      t.metadata?.public_metrics?.like_count || 0,
                reply_count:     t.metadata?.public_metrics?.reply_count || 0,
                tweet_created_at: t.metadata?.created_at || null
            })).filter(r => r.content);

            const { error } = await supabaseClient
                .from('social_intelligence')
                .upsert(rows, { onConflict: 'tweet_id', ignoreDuplicates: true });

            if (error) console.warn('social.js: Supabase persist error:', error.message);
            else console.log(`social.js: Persisted ${rows.length} tweets to Supabase`);
        } catch (e) {
            console.warn('social.js: Persist failed silently:', e.message);
        }
    }

    function detectCategory(content) {
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('help') || lowerContent.includes('evacuate') || lowerContent.includes('danger') || lowerContent.includes('emergency')) {
            return 'Emergency/Alert';
        } else if (lowerContent.includes('fear') || lowerContent.includes('scared') || lowerContent.includes('panic') || lowerContent.includes('!!!')) {
            return 'Panic/Fear';
        } else if (lowerContent.includes('alert') || lowerContent.includes('warning') || lowerContent.includes('official') || lowerContent.includes('incois')) {
            return 'Awareness/Official Info';
        }
        return 'Observation/Neutral Report';
    }

    function detectMisinfo(content) {
        const lowerContent = content.toLowerCase();
        return (lowerContent.includes('dead') && /\d{4,}/.test(content)) || lowerContent.includes('everyone') || lowerContent.includes('all gone');
    }

    function detectHazard(content) {
        const keywords = {
            flood: ['flood', 'flooding', 'inundation', 'बाढ़', 'வெள்ளம்', 'వరద', 'വെള്ളപ്പൊക്കം', 'വെള്ളം'],
            tsunami: ['tsunami', 'tidal wave', 'सुनामी', 'சுனாமி', 'సునామీ', 'സുനാമി'],
            waves: ['wave', 'high wave', 'swell', 'लहरें', 'அலைகள்', 'అలలు', 'തിരമാലകൾ'],
            erosion: ['erosion', 'coastal erosion', 'कटाव', 'அரிப்பு', 'కోత', 'ക്ഷയം'],
            storm: ['storm', 'cyclone', 'hurricane', 'तूफान', 'புயல்', 'తుఫాను', 'കൊടുങ്കാറ്റ്']
        };
        const lowerContent = content.toLowerCase();
        for (const [hazard, words] of Object.entries(keywords)) {
            if (words.some(word => lowerContent.includes(word.toLowerCase()))) {
                return hazard;
            }
        }
        return 'other';
    }

    function determineUrgency(category, hazard) {
        const highCategories = ['Emergency/Alert', 'Panic/Fear'];
        const mediumCategories = ['Observation/Neutral Report', 'Awareness/Official Info'];
        const highHazards = ['tsunami', 'flood', 'storm'];
        if (highCategories.includes(category) || highHazards.includes(hazard)) {
            return 'high';
        } else if (mediumCategories.includes(category) || hazard === 'waves' || hazard === 'erosion') {
            return 'medium';
        }
        return 'low';
    }

    /** Severity level for map color: critical → safe */
    function getSeverityLevel(tweet) {
        if (tweet.misinfo_flag && tweet.urgency === 'high') return 'critical';
        if (tweet.urgency === 'high' || (tweet.category || '').includes('Emergency')) return 'critical';
        if (tweet.urgency === 'medium' || (tweet.category || '').includes('Panic')) return 'high';
        if (tweet.urgency === 'low' && tweet.sentiment === 'positive') return 'safe';
        if (tweet.urgency === 'medium') return 'medium';
        return 'low';
    }

    const SEVERITY_COLORS = {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#ca8a04',
        low: '#65a30d',
        safe: '#22c55e'
    };

    function getSeverityColor(tweet) {
        return SEVERITY_COLORS[getSeverityLevel(tweet)] || SEVERITY_COLORS.low;
    }

    function getPostTimestamp(tweet) {
        const raw = tweet.metadata?.created_at || tweet.created_at;
        if (!raw) return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    function isLatestPost(tweet, allTweets, maxAgeHours = 24) {
        const d = getPostTimestamp(tweet);
        if (!d) return false;
        const ageH = (Date.now() - d.getTime()) / (1000 * 60 * 60);
        if (ageH > maxAgeHours) return false;
        const sorted = [...allTweets].sort((a, b) => {
            const ta = getPostTimestamp(a)?.getTime() || 0;
            const tb = getPostTimestamp(b)?.getTime() || 0;
            return tb - ta;
        });
        const topN = Math.min(3, sorted.length);
        return sorted.slice(0, topN).some(t => t.id === tweet.id || t.content === tweet.content);
    }

    function sortByRecency(tweets) {
        return [...tweets].sort((a, b) => {
            const ta = getPostTimestamp(a)?.getTime() || 0;
            const tb = getPostTimestamp(b)?.getTime() || 0;
            if (tb !== ta) return tb - ta;
            return (b.relevance_score || 0) - (a.relevance_score || 0);
        });
    }

    function extractLocation(tweet, extracted = null) {
        const regions = Object.keys(indianLocations);
        let content = (tweet.content || '').toUpperCase();
        if (extracted && extracted !== 'Unknown') {
            content += ' ' + extracted.toUpperCase();
        }
        if (tweet.metadata?.location) {
            content += ' ' + tweet.metadata.location.toUpperCase();
        }

        const matchedRegion = regions.find(r => content.includes(r));
        if (matchedRegion) {
            return {
                coordinates: indianLocations[matchedRegion],
                region: matchedRegion
            };
        }

        if (tweet.metadata?.geo?.coordinates && Array.isArray(tweet.metadata.geo.coordinates) && tweet.metadata.geo.coordinates.length === 2) {
            return {
                coordinates: tweet.metadata.geo.coordinates,
                region: tweet.metadata.location || 'Unknown'
            };
        }

        return {
            coordinates: [20.5937, 78.9629],
            region: 'Unknown'
        };
    }

    function applyFilters() {
        const hazard = hazardFilter.value;
        const category = sentimentFilter.value;
        const region = regionFilter.value;
        const urgency = urgencyFilter.value;
        const dateRange = dateFilter.value;
        const source = sourceFilter.value;

        const now = new Date();
        let filteredTweets = tweetsData.filter(tweet => {
            const tweetDate = tweet.metadata?.created_at ? new Date(tweet.metadata.created_at) : now;
            const timeDiff = (now - tweetDate) / (1000 * 60 * 60);
            return (hazard === 'all' || tweet.hazard === hazard) &&
                   (category === 'all' || tweet.category.toLowerCase().includes(category.toLowerCase().replace('_', ' '))) &&
                   (region === 'all' || tweet.location.region === region) &&
                   (urgency === 'all' || tweet.urgency === urgency) &&
                   (source === 'all' || (tweet.source || '').includes(source)) &&
                   (dateRange === 'all' ||
                    (dateRange === '24h' && timeDiff <= 24) ||
                    (dateRange === '7d' && timeDiff <= 168) ||
                    (dateRange === '30d' && timeDiff <= 720));
        });

        const sorted = sortByRecency(filteredTweets);
        displayTweets(sorted);
        updateMap(sorted);
        updateAnalytics();
    }

    function updateTweetVolume() {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        tweetVolumeData.push({ time: timeLabel, count: tweetsData.length });
        if (tweetVolumeData.length > 10) tweetVolumeData.shift();
        tweetVolumeChart.data.labels = tweetVolumeData.map(d => d.time);
        tweetVolumeChart.data.datasets[0].data = tweetVolumeData.map(d => d.count);
        tweetVolumeChart.update();
    }

    function updateAnalytics() {
        const categoryCounts = {
            'Emergency/Alert': 0,
            'Observation/Neutral Report': 0,
            'Panic/Fear': 0,
            'Awareness/Official Info': 0,
            'Other': 0
        };
        tweetsData.forEach(tweet => {
            categoryCounts[tweet.category] = (categoryCounts[tweet.category] || 0) + 1;
        });
        categoryChart.data.datasets[0].data = Object.values(categoryCounts);
        categoryChart.update();

        const hazardCounts = { flood: 0, tsunami: 0, waves: 0, erosion: 0, storm: 0, other: 0 };
        tweetsData.forEach(tweet => hazardCounts[tweet.hazard]++);
        hazardDistributionChart.data.datasets[0].data = Object.values(hazardCounts);
        hazardDistributionChart.update();

        const hashtagCounts = {};
        const stopWords = new Set(['the', 'and', 'to', 'in', 'of', 'for', 'on', 'with', 'at', 'is', 'india', 'this', 'that', 'from', 'have', 'were', 'been', 'will', 'what', 'when', 'which']);
        tweetsData.forEach(tweet => {
            (tweet.hashtags || []).forEach(tag => {
                const cleanTag = tag.toLowerCase().replace('#', '');
                hashtagCounts[cleanTag] = (hashtagCounts[cleanTag] || 0) + 2;
            });
            const words = (tweet.content || '').toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
            words.forEach(word => {
                if (!stopWords.has(word)) {
                    hashtagCounts[word] = (hashtagCounts[word] || 0) + 0.5;
                }
            });
        });
        const trending = Object.entries(hashtagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([tag, count]) => `<span class="inline-block bg-blue-100 rounded-full px-3 py-1 text-sm font-semibold text-blue-700 mr-2 mb-2">#${tag}</span>`)
            .join('');

        const misinfoCount = tweetsData.filter(tweet => tweet.misinfo_flag).length;

        trendingKeywordsContainer.innerHTML = `${trending || ''} <span class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm ml-2">⚠️ Suspect: ${misinfoCount}</span>` || '<p class="text-gray-600 font-sans text-sm">No trending hashtags.</p>';
    }

    function updateMap(tweets) {
        markers.clearLayers();
        let hasMarkers = false;
        let latestMarker = null;
        const sorted = sortByRecency(tweets);

        sorted.forEach(tweet => {
            if (!tweet.location?.coordinates || !Array.isArray(tweet.location.coordinates) || tweet.location.coordinates.length !== 2) {
                return;
            }
            const [lat, lng] = tweet.location.coordinates;
            const severity = getSeverityLevel(tweet);
            const color = getSeverityColor(tweet);
            const isLatest = isLatestPost(tweet, sorted);
            const size = isLatest ? 36 : (severity === 'critical' ? 32 : 28);
            const pulseClass = isLatest ? ' marker-latest-pulse' : '';
            const letter = (tweet.hazard || 'o').charAt(0).toUpperCase();

            const marker = L.divIcon({
                className: `custom-marker severity-${severity}${pulseClass}`,
                html: `<div style="background-color:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${isLatest ? '#1e3a8a' : '#fff'};box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${isLatest ? 13 : 11}px;">${letter}${tweet.misinfo_flag ? '!' : ''}</div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });

            const relTime = timeAgo(tweet.metadata?.created_at || tweet.created_at);
            const popupContent = `
                <div class="p-2 max-w-xs">
                    ${isLatest ? '<p class="text-xs font-bold text-blue-700 mb-1">🆕 LATEST ALERT</p>' : ''}
                    <p class="font-semibold">${tweet.metadata?.username || tweet.username || 'Unknown'}</p>
                    <p class="text-sm text-gray-700">${(tweet.content || '').substring(0, 120)}…</p>
                    <p class="text-xs text-gray-500">Posted: ${relTime || 'recent'}</p>
                    <p class="text-xs text-gray-500">Severity: <span style="color:${color};font-weight:700">${severity.toUpperCase()}</span></p>
                    <p class="text-xs text-gray-500">Hazard: ${tweet.hazard} · Urgency: ${tweet.urgency}</p>
                    <p class="text-xs text-gray-500">Region: ${tweet.location.region}</p>
                    ${tweet.relevance_score ? `<p class="text-xs text-gray-500">Relevance: ${Math.round(tweet.relevance_score * 10) / 10}</p>` : ''}
                    ${tweet.misinfo_flag ? `<p class="text-xs text-red-500 mt-1">⚠️ ${tweet.misinfo_reason || 'Potential misinformation'}</p>` : ''}
                </div>
            `;
            const m = L.marker([lat, lng], { icon: marker, zIndexOffset: isLatest ? 1000 : severity === 'critical' ? 500 : 0 })
                .bindPopup(popupContent)
                .addTo(markers);
            if (isLatest && !latestMarker) latestMarker = m;
            hasMarkers = true;
        });

        if (hasMarkers) {
            socialMap.fitBounds(markers.getBounds(), { padding: [30, 30] });
            if (latestMarker) {
                setTimeout(() => latestMarker.openPopup(), 400);
            }
        }
        socialMap.invalidateSize();
        console.log('social.js: Updated map with', tweets.length, 'posts (severity-colored)');
    }

    function getCategoryBadgeClass(category) {
        if (category.includes('Emergency') || category.includes('Alert')) return 'bg-red-500 text-white';
        if (category.includes('Panic') || category.includes('Fear')) return 'bg-yellow-500 text-white';
        if (category.includes('Awareness') || category.includes('Official')) return 'bg-green-500 text-white';
        if (category.includes('Observation') || category.includes('Report')) return 'bg-blue-500 text-white';
        return 'bg-gray-500 text-white';
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const now = new Date();
        const d = new Date(dateStr);
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
        return `${Math.floor(diff/604800)}w ago`;
    }

    function displayTweets(tweets, append = false) {
        console.log('social.js: Displaying', tweets.length, 'tweets', append ? '(appending)' : '(replacing)');
        if (!tweets || tweets.length === 0) {
            if (!append) {
                tweetsContainer.innerHTML = '<p class="text-gray-600 font-sans text-sm">No tweets found matching filters.</p>';
            }
            return;
        }

        const sortedDisplay = sortByRecency(tweets);
        const tweetHTML = sortedDisplay.map((tweet, index) => {
            const username  = tweet.metadata?.username || tweet.username || 'News Source';
            const isLatest = isLatestPost(tweet, sortedDisplay) || index === 0;
            const severity = getSeverityLevel(tweet);
            const borderColor = getSeverityColor(tweet);
            const content   = tweet.content || 'No content';
            const rawDate   = tweet.metadata?.created_at || tweet.created_at;
            const createdAt = rawDate ? new Date(rawDate).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric',
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Unknown Date';
            const relTime = timeAgo(rawDate);
            const srcLabel = (tweet.source || '').includes('twitter') ? 'Twitter' : 'News';
            const srcColor = (tweet.source || '').includes('twitter') ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-600';
            const retweetCount = tweet.metadata?.public_metrics?.retweet_count || tweet.retweet_count || 0;
            const likeCount    = tweet.metadata?.public_metrics?.like_count    || tweet.like_count    || 0;
            const replyCount   = tweet.metadata?.public_metrics?.reply_count   || tweet.reply_count   || 0;
            const regionName   = tweet.location?.region || tweet.location_region || 'Unknown';
            const categoryBadgeClass = getCategoryBadgeClass(tweet.category);
            const urgencyBadgeClass  = tweet.urgency === 'high'   ? 'bg-red-500 text-white' :
                                       tweet.urgency === 'medium' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white';
            const misinfoBadge = tweet.misinfo_flag
                ? `<span class="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">⚠️ Suspect</span>` : '';
            const articleLink = tweet.url
                ? `<a href="${tweet.url}" target="_blank" rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-1">
                      <i class="fas fa-external-link-alt"></i> Read Article
                   </a>` : '';
            const genAIBadge = tweet.confidence
                ? `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs">
                      ✨ AI ${Math.round((tweet.confidence || 0.75) * 100)}% confidence
                   </span>` : '';
            const sentimentIcon = tweet.sentiment === 'positive' ? '🟢' : tweet.sentiment === 'negative' ? '🔴' : '🟡';

            return `
                <div class="bg-white rounded-lg shadow-sm p-4 mb-3 hover:shadow-md transition-shadow ${isLatest ? 'ring-2 ring-blue-500 ring-offset-1' : 'border border-gray-100'}" style="${isLatest ? '' : `border-left: 4px solid ${borderColor}`}">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center space-x-2">
                            ${isLatest ? '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">LATEST</span>' : ''}
                            <div class="w-8 h-8 rounded-full ${(tweet.source || '').includes('twitter') ? 'bg-blue-100' : 'bg-emerald-100'} flex items-center justify-center">
                                <i class="${(tweet.source || '').includes('twitter') ? 'fab fa-twitter text-blue-400' : 'fas fa-newspaper text-emerald-600'} text-xs"></i>
                            </div>
                            <div>
                                <p class="font-semibold text-sm text-gray-900">${username}</p>
                                <p class="text-xs text-gray-400">${relTime ? relTime + ' · ' : ''}${createdAt} · ${regionName}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1">
                            ${sentimentIcon}
                            ${misinfoBadge}
                        </div>
                    </div>
                    <p class="text-gray-700 text-sm mb-3 leading-relaxed">${content.substring(0, 250)}${content.length > 250 ? '…' : ''}</p>
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="px-2 py-1 rounded-full text-xs ${categoryBadgeClass}">${tweet.category}</span>
                        <span class="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">🌊 ${(tweet.hazard || 'other').charAt(0).toUpperCase() + (tweet.hazard || 'other').slice(1)}</span>
                        <span class="px-2 py-1 rounded-full text-xs ${urgencyBadgeClass}">⚡ ${(tweet.urgency || 'low').toUpperCase()}</span>
                        <span class="px-2 py-1 rounded-full text-xs text-white" style="background-color:${borderColor}">${severity.toUpperCase()}</span>
                        <span class="px-2 py-1 rounded-full text-xs ${srcColor}">${srcLabel}</span>
                        ${genAIBadge}
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3 text-xs text-gray-400">
                            <span><i class="fas fa-reply mr-1"></i>${replyCount}</span>
                            <span><i class="fas fa-retweet mr-1"></i>${retweetCount}</span>
                            <span><i class="fas fa-heart mr-1"></i>${likeCount}</span>
                        </div>
                        ${articleLink}
                    </div>
                    ${(tweet.hashtags||[]).length > 0 ? `<p class="text-xs text-gray-400 mt-2">${(tweet.hashtags||[]).slice(0,4).map(h=>'<span class="mr-1">'+h+'</span>').join('')}</p>` : ''}
                </div>
            `;
        }).join('');


        // ✅ XSS Protection: sanitize HTML before injection
        // DOMPurify is loaded in samudradashboard.html
        const sanitize = (typeof DOMPurify !== 'undefined')
            ? (html) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
            : (html) => html; // graceful fallback

        if (append) {
            tweetsContainer.innerHTML += sanitize(tweetHTML);
        } else {
            tweetsContainer.innerHTML = sanitize(tweetHTML);
        }

        console.log('social.js: Tweets rendered successfully');
    }

    // ✅ Debounced search — 500ms delay prevents duplicate API calls on rapid clicks
    const DEFAULT_QUERY = '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ്കാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml';
    let _searchDebounce = null;

    function triggerSearch() {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
            if (!isOnline()) {
                tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">No internet connection. Please reconnect and try again.</p>';
                return;
            }
            const query = searchInput.value.trim() || DEFAULT_QUERY;
            searchTwitter(query);
        }, 500);
    }

    // ✅ Event listeners — all wired through the debounced trigger
    searchButton.addEventListener('click', triggerSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            triggerSearch();
        }
    });

    refreshButton.addEventListener('click', triggerSearch);

    hazardFilter.addEventListener('change', applyFilters);
    sentimentFilter.addEventListener('change', applyFilters);
    regionFilter.addEventListener('change', applyFilters);
    urgencyFilter.addEventListener('change', applyFilters);
    dateFilter.addEventListener('change', applyFilters);
    sourceFilter.addEventListener('change', applyFilters);

    console.log('social.js: Initialized successfully. Ready for searches.');
});
