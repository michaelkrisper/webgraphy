const byteString = "Hello \u00A9";
const arrayBuffer = new Uint8Array(byteString.length);
for (let i = 0; i < byteString.length; i++) {
	arrayBuffer[i] = byteString.charCodeAt(i);
}
console.log(new TextDecoder().decode(arrayBuffer));
