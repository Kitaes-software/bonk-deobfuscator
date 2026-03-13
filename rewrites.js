c.f26.readInt29 = function(){
    const bytes = []
    let offset = 0
    let val = 0
    for (let length = 0;;length++) {
    	if (length === 3){
    		offset++
    		val += this.readByte()
    		break
    	}
    	bytes.push(this.readByte())
    	if (!(bytes[length] & 128)) break
    	bytes[bytes.length-1] -= 128
    }
    for (let i = bytes.length-1; i >= 0; i--){
        offset += 7
        if (offset === 22){
            val += (bytes[i] & 0b00111111) << offset
            val -= (bytes[i] & 0b01000000) << offset
        }
        else val += bytes[i] << offset
    }
    return val
}