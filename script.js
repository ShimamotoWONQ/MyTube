function onKeyDown (event) {
    switch (event.code) {
        case 'KeyO':
            document.getElementById('file-input').click();
            break;

        case 'KeyK':

            break;

        case 'Space':
            event.preventDefault();
            
            break;

        default:
            break;
    }
}

function onLoad () {
   
}

document.addEventListener('keydown', onKeyDown);
window.addEventListener('load', onLoad);
