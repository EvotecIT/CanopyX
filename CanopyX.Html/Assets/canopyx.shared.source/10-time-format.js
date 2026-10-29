  // Compiled into optional playback/propagation parts; the clock and zone remain one wrapping unit.
  function humanTimeFormat(lang, local, utcTemplate) {
    const formatter=new Intl.DateTimeFormat(lang||undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:local?undefined:"UTC",...(local?{timeZoneName:"short"}:{})});
    return {format(value) {
      const parts=formatter.formatToParts(new Date(value));
      const text=parts.map((part,index)=>part.type==="literal"&&parts[index+1]?.type==="timeZoneName"?part.value.replace(/\s/g,"\u00a0"):part.value).join("");
      return local?text:fill(utcTemplate||"{time} UTC",{time:text}).replace(/ (\S+)$/,"\u00a0$1");
    }};
  }
