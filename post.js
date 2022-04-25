
const DAY = document.querySelector('.dag');
    
    function getPnr() {
        const url = window.location.href;
        const pnr = url.split('?');

        return pnr[1];
    }

    
    function updateDel(pnr) {

       
        const delday = document.createElement('p');
        const nextDay = document.createElement('p');
        const city = document.createElement('p');
        const postnr = document.createElement('p');
        
        
        fetch('https://portal.postnord.com/api/sendoutarrival/closest?postalCode=' + pnr)
            .then(response => response.json())
            .then(function (data) {


                
                delday.innerText = 'Posten kommer nästa gång: ' + data['delivery'].split(',')[0];
                nextDay.innerText = 'Och sen kommer den igen: ' + data['upcoming'].split(',')[0];
                city.innerText = data['city'];
                postnr.innerText = data['postalCode'];
             
                DAY.appendChild(delday)
                DAY.appendChild(nextDay)
                document.getElementById("ort").innerHTML = data['city'];
               
            })
    }


    const postnummer = getPnr();
    updateDel(postnummer);
