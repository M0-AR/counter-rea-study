#include <stdio.h>
static unsigned checksum(const char *s){unsigned h=2166136261u;for(;*s;s++){h^=(unsigned char)*s;h*=16777619u;}return h;}
int main(int argc,char**argv){const char*k=argc>1?argv[1]:"ENT-0000";printf("%u\n",checksum(k));return 0;}
