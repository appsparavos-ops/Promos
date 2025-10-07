
document.addEventListener('DOMContentLoaded', () => {
    // --- Inicializar Firebase ---
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    const resultContainer = document.getElementById('result-container');
    const resultTick = document.getElementById('result-tick');
    const resultCross = document.getElementById('result-cross');
    const scanStatus = document.getElementById('scan-status');
    const resetButton = document.getElementById('reset-button');
    const resultMessage = document.getElementById('result-message');

    let isProcessing = false; // Flag para evitar escaneos múltiples
    let html5QrcodeScanner; // Declarar la variable aquí para que sea accesible globalmente

    function onScanSuccess(decodedText, decodedResult) {
        // --- PASO 1: Mostrar lo que se leyó para depurar ---
        const debugOutput = document.getElementById('debug-output');
        debugOutput.textContent = 'QR leído: ' + decodedText;

        if (isProcessing) return;
        isProcessing = true;
        scanStatus.textContent = "Procesando premio...";

        // Detenemos el escáner visualmente para que el usuario sepa que se está procesando.
        // Esto es importante para que la cámara se apague y no siga escaneando.
        html5QrcodeScanner.clear().then(() => {
            // Usamos btoa para codificar el texto del premio en Base64.
            // Esto crea una clave válida para Firebase, evitando problemas con caracteres como '.', '#', '$', '[', o ']'.
            // Se necesita un escape/unescape para que btoa pueda manejar caracteres Unicode como los emojis (🎁).
            const prizeKey = btoa(unescape(encodeURIComponent(decodedText)));

            const canjeadosRef = database.ref('canjeados/' + prizeKey);

            canjeadosRef.transaction(currentData => {
                if (currentData === null) {
                    // El premio no existe, así que lo guardamos.
                    return {
                        prize: decodedText,
                        redeemedAt: new Date().toISOString()
                    };
                } else {
                    // El premio ya existe, la transacción se aborta.
                    // Devolvemos los datos actuales para indicar que ya existe.
                    // Esto es más informativo que devolver 'undefined'.
                    return; // undefined
                }
            }).then(result => {
                if (result.committed) {
                    // Transacción exitosa: el premio se guardó.
                    resultMessage.textContent = "Premio canjeado con éxito.";
                    resultTick.style.display = 'block';
                    resultCross.style.display = 'none';
                    console.log('Firebase: ¡Transacción exitosa! El premio se guardó.');

                    // --- INICIO: Lógica para actualizar el estado del usuario ---
                    // Extraer el código del premio para buscar al usuario.
                    const prizeCode = decodedText.includes('Código:') ? decodedText.split('Código:')[1].trim() : null;
                    if (prizeCode) {
                        database.ref('users').orderByChild('attempt1_result').equalTo(decodedText).once('value', snapshot => {
                            if (snapshot.exists()) {
                                const userId = Object.keys(snapshot.val())[0];
                                database.ref(`users/${userId}`).update({ estadoPremio: 'canjeado' });
                            } else {
                                database.ref('users').orderByChild('attempt2_result').equalTo(decodedText).once('value', snapshot2 => {
                                    if (snapshot2.exists()) {
                                        const userId2 = Object.keys(snapshot2.val())[0];
                                        database.ref(`users/${userId2}`).update({ estadoPremio: 'canjeado' });
                                    }
                                });
                            }
                        });
                    }
                    // --- FIN: Lógica para actualizar el estado del usuario ---
                } else {
                    // Transacción abortada: el premio ya existía.
                    resultMessage.textContent = "¡ATENCIÓN! Este premio ya fue canjeado.";
                    resultTick.style.display = 'none';
                    resultCross.style.display = 'block';
                    console.log('Firebase: La transacción fue abortada (el premio ya existía).');
                }
                // Mostrar el contenedor del resultado y el botón de reseteo.
                resultContainer.style.display = 'flex';
                resetButton.style.display = 'block';

            }).catch(error => {
                console.error("Error en la transacción de Firebase:", error);
                // Mostramos el error en la pantalla principal para que sea visible.
                resultMessage.textContent = `Error de Firebase: ${error.message}`;
                resultCross.style.display = 'block';
                resultContainer.style.display = 'flex'; // Mostramos el contenedor de resultado con el error.
                isProcessing = false; // Permitir reintentar si hay error
                resetButton.style.display = 'block'; // Mostrar botón para reiniciar
            });
        }).catch(error => {
             console.error("Fallo al limpiar el escáner QR.", error);
             isProcessing = false; // Si no se puede limpiar, permitir reintentar
        });
    }

    function onScanFailure(error) {
        // No hacemos nada en caso de fallo, el escáner sigue intentando.
    }

    function startScanner() {
        // Creamos una NUEVA instancia del escáner cada vez que iniciamos.
        // Esto resuelve el error "cameraIdOrConfig is required".
        html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false);
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }

    resetButton.addEventListener('click', () => {
        resultContainer.style.display = 'none';
        resetButton.style.display = 'none';
        resultMessage.textContent = ''; // Limpiar el mensaje de resultado
        scanStatus.textContent = "Apunte la cámara al código QR del premio...";
        
        // *** LA SOLUCIÓN DEFINITIVA ***
        // La librería borra el contenido del div. Lo "revivimos" antes de volver a usarlo.
        document.getElementById('qr-reader').innerHTML = "<!-- Re-initializing scanner -->";
        isProcessing = false;
        startScanner(); // Reinicia el escáner para una nueva lectura
    });

    startScanner();
});
