async function fetchLeads() {
    try {
        const response = await fetch('/api/leads');
        const result = await response.json();
        
        const tableBody = document.getElementById('leadsTable');
        tableBody.innerHTML = '';

        if (result.success && result.data.length > 0) {
            result.data.forEach(lead => {
                const row = `<tr>
                    <td>${new Date(lead.createdAt).toLocaleDateString()}</td>
                    <td>${lead.name}</td>
                    <td>${lead.phone}</td>
                    <td>${lead.propertyType || 'N/A'}</td>
                    <td><span class="badge bg-new">${lead.status}</span></td>
                </tr>`;
                tableBody.innerHTML += row;
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Koi lead nahi mili abhi tak!</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching leads:', error);
    }
}

fetchLeads();
